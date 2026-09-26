//! Interpreter discovery: which Pythons exist and what they are.
//!
//! Metamorphosis (the environment switcher) in the frontend owns the policy;
//! this module only answers factual questions by running interpreters.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tokio::process::Command;

use crate::error::{Error, Result};

pub mod ml;

/// A Python interpreter SPAWN could use.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub path: String,
    /// Where the candidate came from: `broodVenv`, `uv`, or `path`.
    pub source: CandidateSource,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CandidateSource {
    BroodVenv,
    Uv,
    Path,
}

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

/// List interpreters worth offering, most specific first. Never fails: a brood
/// with no venv and a machine with no uv still yields whatever PATH has.
#[tauri::command]
pub async fn env_discover(brood: Option<String>) -> Vec<Candidate> {
    let mut found = Vec::new();

    if let Some(root) = brood.as_deref()
        && let Some(python) = venv_python(Path::new(root))
    {
        found.push(Candidate {
            path: python.to_string_lossy().into_owned(),
            source: CandidateSource::BroodVenv,
        });
    }

    if let Some(python) = uv_find(brood.as_deref()).await {
        push_unique(&mut found, python, CandidateSource::Uv);
    }

    for name in ["python3", "python"] {
        if let Some(python) = find_on_path(name) {
            push_unique(
                &mut found,
                python.to_string_lossy().into_owned(),
                CandidateSource::Path,
            );
        }
    }

    found
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

/// Path to `uv` if it is installed, so the chrome can say so.
#[tauri::command]
pub fn env_uv_path() -> Option<String> {
    find_on_path("uv").map(|p| p.to_string_lossy().into_owned())
}

fn push_unique(found: &mut Vec<Candidate>, path: String, source: CandidateSource) {
    if !found.iter().any(|c| c.path == path) {
        found.push(Candidate { path, source });
    }
}

/// The interpreter inside `<brood>/.venv`, if there is one.
pub fn venv_python(brood: &Path) -> Option<PathBuf> {
    let venv = brood.join(".venv");
    let candidates: &[&str] = if cfg!(windows) {
        &["Scripts/python.exe"]
    } else {
        &["bin/python", "bin/python3"]
    };
    candidates
        .iter()
        .map(|rel| venv.join(rel))
        .find(|p| p.is_file())
}

async fn uv_find(cwd: Option<&str>) -> Option<String> {
    let uv = find_on_path("uv")?;
    let mut cmd = Command::new(uv);
    cmd.args(["python", "find"]);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let output = quiet(&mut cmd).output().await.ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    (!path.is_empty()).then_some(path)
}

/// Walk PATH for an executable, like `which`, without a dependency.
pub fn find_on_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let names: Vec<String> = if cfg!(windows) {
        vec![format!("{name}.exe"), name.to_owned()]
    } else {
        vec![name.to_owned()]
    };
    std::env::split_paths(&path)
        .flat_map(|dir| names.iter().map(move |n| dir.join(n)))
        .find(|p| is_executable(p))
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
    fn venv_python_is_none_without_a_venv() {
        let dir = std::env::temp_dir().join(format!("spawn-env-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        assert_eq!(venv_python(&dir), None);
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
        assert_eq!(venv_python(&dir), Some(python));
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn find_on_path_locates_a_shell() {
        // Every CI image has some shell; on Windows `cmd` is always present.
        let name = if cfg!(windows) { "cmd" } else { "sh" };
        assert!(find_on_path(name).is_some());
    }

    #[test]
    fn find_on_path_misses_nonsense() {
        assert!(find_on_path("spawn-definitely-not-a-real-binary").is_none());
    }
}
