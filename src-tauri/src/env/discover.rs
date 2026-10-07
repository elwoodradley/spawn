//! Finding Python interpreters, most project-specific first.
//!
//! Order: the project's own virtual environment; the interpreter uv resolves
//! for the project (honouring `requires-python`); interpreters uv manages;
//! Homebrew, pyenv and (Windows) python.org installs; then whatever is on
//! PATH, with the operating system's own Python last and tagged as such,
//! because on macOS `/usr/bin/python3` is first on PATH and almost never what anyone wants.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tokio::process::Command;

use super::locations::{home_dir, python_org_windows};
use super::{find_on_path, quiet};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub path: String,
    pub source: CandidateSource,
    /// Known cheaply from the path or uv's listing; `None` means probe it.
    pub version: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub enum CandidateSource {
    BroodVenv,
    Uv,
    UvManaged,
    Homebrew,
    Pyenv,
    /// A python.org install found in its default folder (Windows).
    PythonOrg,
    Path,
    System,
}

/// Entry of `uv python list --only-installed --output-format json`.
#[derive(Debug, Deserialize)]
pub struct UvListed {
    pub path: String,
    pub version: Option<String>,
}

pub async fn discover(project: Option<&str>) -> Vec<Candidate> {
    let mut found: Vec<Candidate> = Vec::new();

    if let Some(root) = project {
        for python in project_venvs(Path::new(root)) {
            push(&mut found, python, CandidateSource::BroodVenv, None);
        }
        if Path::new(root).join("pyproject.toml").is_file()
            && let Some(python) = uv_find(root).await
        {
            push(&mut found, python, CandidateSource::Uv, None);
        }
    }

    let uv_dir = uv_python_dir().await;
    for listed in uv_list().await {
        let source = classify(Path::new(&listed.path), uv_dir.as_deref());
        push(&mut found, listed.path, source, listed.version);
    }

    for python in homebrew_pythons() {
        let version = version_from_path(&python);
        push(&mut found, python, CandidateSource::Homebrew, version);
    }
    for python in pyenv_pythons() {
        let version = version_from_path(&python);
        push(&mut found, python, CandidateSource::Pyenv, version);
    }

    if cfg!(windows) {
        let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
        let programs = std::env::var_os("ProgramFiles").map(PathBuf::from);
        for (python, version) in python_org_windows(local.as_deref(), programs.as_deref()) {
            push(&mut found, python, CandidateSource::PythonOrg, version);
        }
    }

    for name in ["python3", "python"] {
        if let Some(python) = find_on_path(name) {
            let source = classify(&python, uv_dir.as_deref());
            let source = if source == CandidateSource::UvManaged {
                source
            } else {
                classify_path_or_system(&python)
            };
            let text = python.to_string_lossy().into_owned();
            let version = version_from_path(&text);
            push(&mut found, text, source, version);
        }
    }

    found.sort_by_key(|c| c.source);
    found
}

/// Keep the first occurrence of each real file; later duplicates only fill in
/// a missing version.
fn push(
    found: &mut Vec<Candidate>,
    path: String,
    source: CandidateSource,
    version: Option<String>,
) {
    let real = canonical(&path);
    if let Some(existing) = found.iter_mut().find(|c| canonical(&c.path) == real) {
        if existing.version.is_none() {
            existing.version = version;
        }
        if source < existing.source {
            existing.source = source;
        }
        return;
    }
    found.push(Candidate {
        path,
        source,
        version,
    });
}

fn canonical(path: &str) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| PathBuf::from(path))
}

/// Interpreters inside `.venv`, `venv` or `.env` in the project.
pub fn project_venvs(root: &Path) -> Vec<String> {
    let names = ["/.venv", "/venv", "/.env"];
    let rel: &[&str] = if cfg!(windows) {
        &["Scripts/python.exe"]
    } else {
        &["bin/python", "bin/python3"]
    };
    let mut out = Vec::new();
    for name in names {
        let env = root.join(name.trim_start_matches('/'));
        if let Some(python) = rel.iter().map(|r| env.join(r)).find(|p| p.is_file()) {
            out.push(python.to_string_lossy().into_owned());
        }
    }
    out
}

/// Where the path says the interpreter came from, given uv's python dir.
pub fn classify(path: &Path, uv_dir: Option<&Path>) -> CandidateSource {
    let text = path.to_string_lossy().replace('\\', "/");
    if let Some(dir) = uv_dir
        && path.starts_with(dir)
    {
        return CandidateSource::UvManaged;
    }
    if text.contains("/uv/python/") {
        return CandidateSource::UvManaged;
    }
    if text.contains("/.pyenv/") {
        return CandidateSource::Pyenv;
    }
    if text.starts_with("/opt/homebrew/")
        || text.starts_with("/usr/local/Cellar/")
        || text.starts_with("/usr/local/opt/")
        || text.starts_with("/home/linuxbrew/.linuxbrew/")
        || (cfg!(target_os = "macos") && text.starts_with("/usr/local/bin/python"))
    {
        return CandidateSource::Homebrew;
    }
    classify_path_or_system(path)
}

/// PATH pythons that are really the operating system's own.
pub fn classify_path_or_system(path: &Path) -> CandidateSource {
    let text = path.to_string_lossy().replace('\\', "/");
    let system_prefixes = [
        "/usr/bin/python",
        "/bin/python",
        "/System/Library/",
        "/Library/Developer/CommandLineTools/",
        "/Applications/Xcode.app/",
    ];
    if system_prefixes.iter().any(|p| text.starts_with(p)) {
        CandidateSource::System
    } else {
        CandidateSource::Path
    }
}

/// `3.13.2` from `cpython-3.13.2-macos-aarch64-none`, `.pyenv/versions/3.12.1`,
/// or `python3.13`; `None` when the path does not say.
pub fn version_from_path(path: &str) -> Option<String> {
    let text = path.replace('\\', "/");
    // cpython-3.13.2-... (uv) or a bare 3.12.1 segment (pyenv)
    for seg in text.split('/') {
        let seg = seg.strip_prefix("cpython-").unwrap_or(seg);
        let digits: String = seg
            .chars()
            .take_while(|c| c.is_ascii_digit() || *c == '.')
            .collect();
        if digits.matches('.').count() == 2 && digits.starts_with('3') {
            return Some(digits.trim_end_matches('.').to_owned());
        }
    }
    // python3.13 / python@3.13
    let name = text.rsplit('/').next().unwrap_or("");
    let rest = name
        .strip_prefix("python@")
        .or_else(|| name.strip_prefix("python"))?;
    let digits: String = rest
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    (digits.matches('.').count() == 1 && digits.starts_with('3')).then_some(digits)
}

fn homebrew_pythons() -> Vec<String> {
    let dirs = [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/home/linuxbrew/.linuxbrew/bin",
    ];
    let mut out = Vec::new();
    for dir in dirs {
        if !(cfg!(target_os = "macos") || dir.contains("linuxbrew")) {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            // python3.13, not python3.13-config
            if name.starts_with("python3.") && !name.contains('-') {
                out.push(entry.path().to_string_lossy().into_owned());
            }
        }
    }
    out.sort();
    out.reverse();
    out
}

fn pyenv_pythons() -> Vec<String> {
    let Some(home) = home_dir() else {
        return Vec::new();
    };
    // pyenv on Unix; pyenv-win keeps python.exe at the top of each version.
    let (versions, exe) = if cfg!(windows) {
        (
            home.join(".pyenv").join("pyenv-win").join("versions"),
            "python.exe",
        )
    } else {
        (home.join(".pyenv").join("versions"), "bin/python")
    };
    let Ok(entries) = std::fs::read_dir(versions) else {
        return Vec::new();
    };
    let mut out: Vec<String> = entries
        .flatten()
        .map(|e| e.path().join(exe))
        .filter(|p| p.is_file())
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    out.sort();
    out.reverse();
    out
}

async fn uv(args: &[&str], cwd: Option<&str>) -> Option<String> {
    let uv = find_on_path("uv")?;
    let mut cmd = Command::new(uv);
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let output = quiet(&mut cmd).output().await.ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    (!text.is_empty()).then_some(text)
}

async fn uv_find(project: &str) -> Option<String> {
    uv(&["python", "find"], Some(project)).await
}

async fn uv_python_dir() -> Option<PathBuf> {
    uv(&["python", "dir"], None).await.map(PathBuf::from)
}

async fn uv_list() -> Vec<UvListed> {
    match uv(
        &[
            "python",
            "list",
            "--only-installed",
            "--output-format",
            "json",
        ],
        None,
    )
    .await
    {
        Some(json) => parse_uv_list(&json),
        None => Vec::new(),
    }
}

pub fn parse_uv_list(json: &str) -> Vec<UvListed> {
    serde_json::from_str::<Vec<UvListed>>(json).unwrap_or_default()
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn classifies_system_and_package_manager_paths() {
        let uv_dir = Path::new("/home/me/.local/share/uv/python");
        assert_eq!(
            classify(Path::new("/usr/bin/python3"), None),
            CandidateSource::System
        );
        assert_eq!(
            classify(
                Path::new("/Library/Developer/CommandLineTools/usr/bin/python3"),
                None
            ),
            CandidateSource::System
        );
        assert_eq!(
            classify(Path::new("/opt/homebrew/bin/python3.13"), None),
            CandidateSource::Homebrew
        );
        assert_eq!(
            classify(
                Path::new("/home/me/.pyenv/versions/3.12.1/bin/python"),
                None
            ),
            CandidateSource::Pyenv
        );
        assert_eq!(
            classify(
                Path::new(
                    "/home/me/.local/share/uv/python/cpython-3.13.2-linux-x86_64-gnu/bin/python3.13"
                ),
                Some(uv_dir)
            ),
            CandidateSource::UvManaged
        );
        assert_eq!(
            classify(Path::new("/home/me/tools/bin/python3"), None),
            CandidateSource::Path
        );
    }

    #[test]
    fn reads_versions_out_of_paths() {
        assert_eq!(
            version_from_path("/x/uv/python/cpython-3.13.2-macos-aarch64-none/bin/python3.13"),
            Some("3.13.2".into())
        );
        assert_eq!(
            version_from_path("/home/me/.pyenv/versions/3.12.1/bin/python"),
            Some("3.12.1".into())
        );
        assert_eq!(
            version_from_path("/opt/homebrew/bin/python3.13"),
            Some("3.13".into())
        );
        assert_eq!(version_from_path("/usr/bin/python3"), None);
    }

    #[test]
    fn parses_uv_listing() {
        let json = r#"[{"key":"cpython-3.14.7-linux-x86_64-gnu","version":"3.14.7","path":"/usr/bin/python3.14","symlink":null},{"key":"x","version":"3.13.2","path":"/home/me/.local/share/uv/python/cpython-3.13.2-linux-x86_64-gnu/bin/python3.13","symlink":null}]"#;
        let list = parse_uv_list(json);
        assert_eq!(list.len(), 2);
        assert_eq!(list[1].version.as_deref(), Some("3.13.2"));
        assert!(parse_uv_list("not json").is_empty());
    }

    #[test]
    fn dedupes_by_real_file_and_keeps_the_better_source() {
        let mut found = Vec::new();
        push(
            &mut found,
            "/usr/bin/python3".into(),
            CandidateSource::Path,
            None,
        );
        push(
            &mut found,
            "/usr/bin/python3".into(),
            CandidateSource::System,
            Some("3.9.6".into()),
        );
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].source, CandidateSource::Path);
        assert_eq!(found[0].version.as_deref(), Some("3.9.6"));
    }

    #[test]
    fn sources_order_from_project_to_system() {
        assert!(CandidateSource::BroodVenv < CandidateSource::Uv);
        assert!(CandidateSource::UvManaged < CandidateSource::Homebrew);
        assert!(CandidateSource::Pyenv < CandidateSource::PythonOrg);
        assert!(CandidateSource::PythonOrg < CandidateSource::Path);
        assert!(CandidateSource::Path < CandidateSource::System);
    }
}
