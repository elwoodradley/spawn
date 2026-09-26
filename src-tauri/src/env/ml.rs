//! ML-stack awareness: what an interpreter has installed (numpy, pandas,
//! torch, jax), which device torch would use, and system memory.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::process::Command;

use super::quiet;
use crate::error::{Error, Result};

/// What the ML stack in an interpreter looks like. Every field is optional
/// because every package is optional; a bare interpreter answers all `None`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MlInfo {
    pub numpy: Option<String>,
    pub pandas: Option<String>,
    pub torch: Option<String>,
    /// `cuda`, `mps` or `cpu` when torch is present.
    pub device: Option<String>,
    pub device_name: Option<String>,
    pub cuda: Option<String>,
    pub gpu_mem_used: Option<u64>,
    pub gpu_mem_total: Option<u64>,
    pub jax: Option<String>,
}

/// Importing torch can take seconds; the probe runs in the background with a
/// hard cap so a wedged interpreter cannot hang the chrome.
const ML_PROBE_TIMEOUT: Duration = Duration::from_secs(20);

/// Every import is wrapped so a missing or broken package yields `null`
/// rather than a failed probe. Prints exactly one JSON line at the end.
const ML_PROBE: &str = include_str!("ml_probe.py");

/// Ask an interpreter which ML packages it has and what device torch sees.
#[tauri::command]
pub async fn env_probe_ml(python: String) -> Result<MlInfo> {
    let mut cmd = Command::new(&python);
    quiet(&mut cmd)
        .args(["-c", ML_PROBE])
        .env("PYTHONWARNINGS", "ignore")
        .kill_on_drop(true);
    let output = tokio::time::timeout(ML_PROBE_TIMEOUT, cmd.output())
        .await
        .map_err(|_| {
            Error::Message(format!("{python} took too long to import its ML packages"))
        })??;
    if !output.status.success() {
        return Err(Error::Message(format!(
            "{python} could not run the ML probe: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout
        .lines()
        .rev()
        .find(|l| l.trim_start().starts_with('{'))
        .ok_or_else(|| Error::Message(format!("no probe output from {python}")))?;
    serde_json::from_str(line)
        .map_err(|err| Error::Message(format!("unreadable ML probe output from {python}: {err}")))
}

/// System memory in bytes, for the status bar.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInfo {
    pub used: u64,
    pub total: u64,
}

#[tauri::command]
pub fn sys_memory() -> MemoryInfo {
    #[cfg(target_os = "linux")]
    if let Some(info) = std::fs::read_to_string("/proc/meminfo")
        .ok()
        .and_then(|text| parse_meminfo(&text))
    {
        return info;
    }
    let mut system = sysinfo::System::new();
    system.refresh_memory();
    MemoryInfo {
        used: system.used_memory(),
        total: system.total_memory(),
    }
}

/// `used` is what the kernel would have to reclaim: total minus MemAvailable,
/// which is what `free` and htop show, not total minus MemFree.
#[cfg(any(target_os = "linux", test))]
pub fn parse_meminfo(text: &str) -> Option<MemoryInfo> {
    let mut total = None;
    let mut available = None;
    for line in text.lines() {
        let (key, rest) = line.split_once(':')?;
        let kib: u64 = rest.trim().trim_end_matches("kB").trim().parse().ok()?;
        match key {
            "MemTotal" => total = Some(kib * 1024),
            "MemAvailable" => available = Some(kib * 1024),
            _ => {}
        }
        if total.is_some() && available.is_some() {
            break;
        }
    }
    let total = total?;
    let available = available?;
    Some(MemoryInfo {
        used: total.saturating_sub(available),
        total,
    })
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn parses_proc_meminfo() {
        let text = "MemTotal:       32654868 kB\nMemFree:         1234567 kB\nMemAvailable:   20000000 kB\nBuffers:          123 kB\n";
        let info = parse_meminfo(text).expect("parsed");
        assert_eq!(info.total, 32654868 * 1024);
        assert_eq!(info.used, (32654868 - 20000000) * 1024);
    }

    #[test]
    fn meminfo_without_available_is_none() {
        assert!(parse_meminfo("MemTotal: 10 kB\nMemFree: 5 kB\n").is_none());
        assert!(parse_meminfo("garbage").is_none());
    }

    #[test]
    fn ml_info_round_trips_from_probe_shape() {
        let json = r#"{"numpy":"2.3.1","pandas":null,"torch":"2.9.0+cu126","device":"cuda","deviceName":"NVIDIA GeForce RTX 4090","cuda":"12.6","gpuMemUsed":1024,"gpuMemTotal":2048,"jax":null}"#;
        let info: MlInfo = serde_json::from_str(json).expect("parse");
        assert_eq!(info.device.as_deref(), Some("cuda"));
        assert_eq!(info.gpu_mem_total, Some(2048));
        assert_eq!(info.pandas, None);
    }
}
