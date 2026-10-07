//! Ending a child together with everything it started.
//!
//! A student's script may start its own processes (multiprocessing pools,
//! DataLoader workers, a `.cmd` shim's node). Killing only the direct child
//! leaves those running, so every child SPAWN starts gets its own process
//! group on Unix, and on Windows `taskkill /T` walks the tree.

use tokio::process::Command;

/// CREATE_NO_WINDOW: never flash a console window behind the IDE.
#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Set up a command so `kill_tree` can later reach all of its descendants.
pub fn prepare(cmd: &mut Command) -> &mut Command {
    #[cfg(unix)]
    cmd.process_group(0);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// Kill `pid` and its descendants. Best effort and synchronous, so it also
/// works from the app's exit handler where no async task will run again.
pub fn kill_tree(pid: u32) {
    // pid 0 would mean "our own process group" to kill(2).
    if pid == 0 {
        return;
    }
    #[cfg(unix)]
    if let Ok(group) = libc::pid_t::try_from(pid) {
        // SAFETY: plain syscall; the child leads its own group (see
        // `prepare`), and a group that is already gone returns ESRCH.
        unsafe {
            libc::kill(-group, libc::SIGKILL);
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let taskkill = std::env::var_os("SystemRoot")
            .map(|root| {
                std::path::PathBuf::from(root)
                    .join("System32")
                    .join("taskkill.exe")
            })
            .unwrap_or_else(|| "taskkill".into());
        let _ = std::process::Command::new(taskkill)
            .args(["/T", "/F", "/PID", &pid.to_string()])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
}

#[cfg(all(test, target_os = "linux"))]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;
    use tokio::io::AsyncBufReadExt;

    fn alive(pid: u32) -> bool {
        // Gone, or a zombie waiting for its new parent to reap it.
        match std::fs::read_to_string(format!("/proc/{pid}/stat")) {
            Ok(stat) => !stat.contains(") Z "),
            Err(_) => false,
        }
    }

    #[tokio::test]
    async fn kills_the_grandchildren_too() {
        let mut cmd = Command::new("sh");
        cmd.args(["-c", "sleep 30 & echo $!; wait"])
            .stdout(std::process::Stdio::piped())
            .kill_on_drop(true);
        let mut child = prepare(&mut cmd).spawn().expect("spawn sh");
        let pid = child.id().expect("pid");
        let stdout = child.stdout.take().expect("stdout");
        let mut lines = tokio::io::BufReader::new(stdout).lines();
        let grandchild: u32 = lines
            .next_line()
            .await
            .expect("read")
            .expect("a line")
            .trim()
            .parse()
            .expect("a pid");
        assert!(alive(grandchild));

        kill_tree(pid);
        child.wait().await.expect("wait");
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while alive(grandchild) && std::time::Instant::now() < deadline {
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        assert!(!alive(grandchild), "sleep {grandchild} outlived its parent");
    }
}
