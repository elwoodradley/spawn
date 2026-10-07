//! Interpreter discovery: which Pythons exist and what they are.
//!
//! Metamorphosis (the environment switcher) in the frontend owns the policy;
//! this module only answers factual questions by running interpreters.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tokio::process::Command;

use crate::error::{Error, Result};

pub mod locations;
pub mod ml;

pub mod discover;
pub use discover::Candidate;

/// What an interpreter says about itself. Produced by `env_probe`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PythonInfo {
    pub executable: String,
    pub version: String,
    pub prefix: String,
    pub platform: String,
}

const PROBE: &str = "import sys, json; print(json.dumps({\
    'executable': sys.executable, \
    'version': '%d.%d.%d' % sys.version_info[:3], \
    'prefix': sys.prefix, \
    'platform': sys.platform}))";

/// List interpreters worth offering, most project-specific first, the
/// operating system's own Python last. Never fails.
#[tauri::command]
pub async fn env_discover(brood: Option<String>) -> Vec<Candidate> {
    discover::discover(brood.as_deref()).await
}

/// Ask an interpreter to describe itself.
#[tauri::command]
pub async fn env_probe(python: String) -> Result<PythonInfo> {
    let mut cmd = Command::new(&python);
    let output = quiet(&mut cmd).args(["-c", PROBE]).output().await?;
    if !output.status.success() {
        return Err(Error::Message(format!(
            "{python} did not answer the probe: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|err| Error::Message(format!("unreadable probe output from {python}: {err}")))
}

/// Absolute path of an executable on PATH, or none. Used to find tools
/// such as a language server without shelling out to `which`.
#[tauri::command]
pub fn env_which(name: String) -> Option<String> {
    if name.contains(['/', '\\']) || name.is_empty() {
        return None;
    }
    find_on_path(&name).map(|p| p.to_string_lossy().into_owned())
}

/// Path to `uv` if it is installed, so the chrome can say so.
#[tauri::command]
pub fn env_uv_path() -> Option<String> {
    find_on_path("uv").map(|p| p.to_string_lossy().into_owned())
}

/// Walk PATH for an executable, like `which`, without a dependency.
pub fn find_on_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let names = executable_names(name, cfg!(windows));
    std::env::split_paths(&path)
        .flat_map(|dir| names.iter().map(move |n| dir.join(n)))
        .find(|p| is_executable(p))
}

/// File names that run as `name`. On Windows that is `name.exe` or a
/// `.cmd`/`.bat` shim (npm installs `pyright-langserver.cmd` next to an
/// extensionless shell script that Windows cannot start), never the bare name
/// unless it already carries an extension.
fn executable_names(name: &str, windows: bool) -> Vec<String> {
    if !windows {
        return vec![name.to_owned()];
    }
    let lower = name.to_ascii_lowercase();
    let exts = [".exe", ".cmd", ".bat", ".com"];
    if exts.iter().any(|ext| lower.ends_with(ext)) {
        return vec![name.to_owned()];
    }
    exts.iter().map(|ext| format!("{name}{ext}")).collect()
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.is_file()
}

/// Never let a probe pop a console window on Windows.
pub(super) fn quiet(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);
    cmd
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn project_venvs_is_empty_without_a_venv() {
        let dir = std::env::temp_dir().join(format!("spawn-env-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        assert!(discover::project_venvs(&dir).is_empty());
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn venv_python_finds_bin_python() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("spawn-venv-test-{}", std::process::id()));
        let bin = dir.join(".venv/bin");
        std::fs::create_dir_all(&bin).expect("temp dir");
        let python = bin.join("python");
        std::fs::write(&python, "#!/bin/sh\n").expect("write");
        std::fs::set_permissions(&python, std::fs::Permissions::from_mode(0o755)).expect("chmod");
        assert_eq!(
            discover::project_venvs(&dir),
            vec![python.to_string_lossy().into_owned()]
        );
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn find_on_path_locates_a_shell() {
        // Every CI image has some shell; on Windows `cmd` is always present.
        let name = if cfg!(windows) { "cmd" } else { "sh" };
        assert!(find_on_path(name).is_some());
    }

    #[test]
    fn windows_names_prefer_exe_then_shims_and_skip_the_bare_script() {
        assert_eq!(
            executable_names("pyright-langserver", true),
            vec![
                "pyright-langserver.exe",
                "pyright-langserver.cmd",
                "pyright-langserver.bat",
                "pyright-langserver.com"
            ]
        );
        assert_eq!(executable_names("uv.EXE", true), vec!["uv.EXE"]);
        assert_eq!(executable_names("uv", false), vec!["uv"]);
    }

    #[test]
    fn find_on_path_misses_nonsense() {
        assert!(find_on_path("spawn-definitely-not-a-real-binary").is_none());
    }
}
