//! Standard install folders that a GUI launch may not have on PATH.
//!
//! An app started from Finder or the Dock gets launchd's PATH
//! (`/usr/bin:/bin:/usr/sbin:/sbin`), and a Linux desktop launcher gets the
//! session's PATH without whatever a shell rc file (bash, zsh, fish) adds. So
//! uv in `~/.local/bin`, Homebrew's `/opt/homebrew/bin`, and the `node` that
//! pyright's `#!/usr/bin/env node` needs are all invisible, although they work
//! in the student's terminal. SPAWN appends the usual folders to its own PATH
//! once at startup; children (runs, the console, pyright) inherit it.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

/// The user's home folder, from the variable each OS sets.
pub fn home_dir() -> Option<PathBuf> {
    let var = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    std::env::var_os(var)
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
}

/// Where uv, pipx, npm globals and Homebrew put executables by default.
pub fn fallback_dirs(home: Option<&Path>) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(home) = home {
        // uv's and pipx's installers, and `cargo install uv`.
        dirs.push(home.join(".local").join("bin"));
        dirs.push(home.join(".cargo").join("bin"));
    }
    #[cfg(unix)]
    dirs.extend(
        [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/home/linuxbrew/.linuxbrew/bin",
        ]
        .map(PathBuf::from),
    );
    #[cfg(windows)]
    if let Some(appdata) = std::env::var_os("APPDATA") {
        // `npm install -g pyright` puts pyright-langserver.cmd here.
        dirs.push(PathBuf::from(appdata).join("npm"));
    }
    dirs
}

/// `current` with each existing folder from `extra` appended that it lacks,
/// or `None` when nothing changes. The user's own PATH order still wins.
pub fn extended_path(current: Option<OsString>, extra: &[PathBuf]) -> Option<OsString> {
    let mut parts: Vec<PathBuf> = current
        .as_deref()
        .map(|p| std::env::split_paths(p).collect())
        .unwrap_or_default();
    let before = parts.len();
    for dir in extra {
        if dir.is_dir() && !parts.contains(dir) {
            parts.push(dir.clone());
        }
    }
    if parts.len() == before {
        return None;
    }
    std::env::join_paths(parts).ok()
}

/// Append the fallback folders to this process's PATH. Must run before any
/// other thread exists (first thing in `run()`).
pub fn extend_process_path() {
    let home = home_dir();
    let extra = fallback_dirs(home.as_deref());
    if let Some(path) = extended_path(std::env::var_os("PATH"), &extra) {
        // SAFETY: called from `run()` before Tauri or tokio start any thread.
        unsafe {
            std::env::set_var("PATH", path);
        }
    }
}

/// python.org installs on Windows, newest first, with the version their
/// folder names: per user under `%LOCALAPPDATA%\Programs\Python\Python312`,
/// for all users under `%ProgramFiles%\Python312`. The installer leaves
/// "Add python.exe to PATH" unticked by default, so PATH alone misses them.
pub fn python_org_windows(
    local_app_data: Option<&Path>,
    program_files: Option<&Path>,
) -> Vec<(String, Option<String>)> {
    let roots = [
        local_app_data.map(|d| d.join("Programs").join("Python")),
        program_files.map(Path::to_path_buf),
    ];
    let mut found: Vec<((u32, u32), String)> = Vec::new();
    for root in roots.into_iter().flatten() {
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let Some(version) = python_org_version(&name) else {
                continue;
            };
            let python = entry.path().join("python.exe");
            if python.is_file() {
                found.push((version, python.to_string_lossy().into_owned()));
            }
        }
    }
    found.sort_by_key(|entry| std::cmp::Reverse(entry.0));
    found
        .into_iter()
        .map(|((major, minor), path)| (path, Some(format!("{major}.{minor}"))))
        .collect()
}

/// `(3, 12)` from `Python312` or `Python312-32`.
fn python_org_version(folder: &str) -> Option<(u32, u32)> {
    if !folder.get(..6)?.eq_ignore_ascii_case("python") {
        return None;
    }
    let rest = folder.get(6..)?;
    let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
    let minor = digits.strip_prefix('3')?;
    Some((3, minor.parse().ok()?))
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn finds_python_org_installs_newest_first() {
        let root = std::env::temp_dir().join(format!("spawn-pyorg-test-{}", std::process::id()));
        let local = root.join("Local");
        let programs = root.join("Program Files");
        for dir in [
            local.join("Programs/Python/Python39"),
            local.join("Programs/Python/Python312"),
            programs.join("Python311-32"),
            programs.join("Python310"),      // no python.exe inside
            programs.join("PythonSoftware"), // not an install
        ] {
            std::fs::create_dir_all(&dir).expect("dir");
        }
        for exe in [
            local.join("Programs/Python/Python39/python.exe"),
            local.join("Programs/Python/Python312/python.exe"),
            programs.join("Python311-32/python.exe"),
            programs.join("PythonSoftware/python.exe"),
        ] {
            std::fs::write(exe, "").expect("write");
        }
        let found = python_org_windows(Some(&local), Some(&programs));
        let versions: Vec<_> = found.iter().map(|(_, v)| v.as_deref()).collect();
        assert_eq!(versions, vec![Some("3.12"), Some("3.11"), Some("3.9")]);
        assert!(found[0].0.ends_with("python.exe"));
        assert!(python_org_windows(None, None).is_empty());
        std::fs::remove_dir_all(&root).expect("cleanup");
    }

    #[test]
    fn appends_existing_missing_folders_only() {
        let root = std::env::temp_dir().join(format!("spawn-path-test-{}", std::process::id()));
        let present = root.join("present");
        let extra = root.join("extra");
        std::fs::create_dir_all(&present).expect("dir");
        std::fs::create_dir_all(&extra).expect("dir");
        let current = std::env::join_paths([&present]).expect("join");

        let out = extended_path(
            Some(current.clone()),
            &[present.clone(), extra.clone(), root.join("absent")],
        )
        .expect("changed");
        let parts: Vec<PathBuf> = std::env::split_paths(&out).collect();
        assert_eq!(parts, vec![present.clone(), extra.clone()]);

        assert_eq!(extended_path(Some(out), std::slice::from_ref(&extra)), None);
        assert_eq!(extended_path(Some(current), &[root.join("absent")]), None);
        std::fs::remove_dir_all(&root).expect("cleanup");
    }

    #[test]
    fn works_without_any_path() {
        let dir = std::env::temp_dir();
        let out = extended_path(None, std::slice::from_ref(&dir)).expect("changed");
        assert_eq!(std::env::split_paths(&out).collect::<Vec<_>>(), vec![dir]);
    }

    #[test]
    fn home_folders_come_first() {
        let dirs = fallback_dirs(Some(Path::new("/home/student")));
        assert_eq!(dirs[0], Path::new("/home/student/.local/bin"));
        assert_eq!(dirs[1], Path::new("/home/student/.cargo/bin"));
    }
}
