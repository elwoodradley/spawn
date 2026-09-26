//! Spawning one child and pumping its pipes to the frontend.

use std::process::Stdio;
use std::sync::Arc;

use serde::Serialize;
use tauri::ipc::Channel;
use tokio::io::AsyncReadExt;
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{Mutex, mpsc, oneshot};

use super::SpawnRequest;
use super::utf8::Utf8Stream;
use crate::error::Result;

/// Everything the frontend hears about a running process, in order.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ProcEvent {
    Started {
        pid: Option<u32>,
    },
    Stdout {
        text: String,
    },
    Stderr {
        text: String,
    },
    /// The child ended. `code` is `None` when a signal ended it on Unix.
    Exit {
        code: Option<i32>,
        signal: Option<i32>,
    },
    /// Something went wrong on our side (a pipe read failed, for example).
    Croak {
        message: String,
    },
}

pub struct Spawned {
    child: Child,
    pub stdin: Arc<Mutex<Option<ChildStdin>>>,
}

impl Spawned {
    pub fn pid(&self) -> Option<u32> {
        self.child.id()
    }
}

/// Read size per pipe read. Large enough that a chatty training loop does not
/// cost a syscall per line, small enough that output still feels live.
const READ_CHUNK: usize = 16 * 1024;

pub fn spawn(request: &SpawnRequest) -> Result<Spawned> {
    let mut cmd = Command::new(&request.program);
    cmd.args(&request.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    if let Some(cwd) = &request.cwd {
        cmd.current_dir(cwd);
    }
    for (key, value) in &request.env {
        cmd.env(key, value);
    }

    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW: never flash a console window behind the IDE.
        cmd.creation_flags(0x0800_0000);
    }

    let mut child = cmd.spawn()?;
    let stdin = child.stdin.take();

    Ok(Spawned {
        child,
        stdin: Arc::new(Mutex::new(stdin)),
    })
}

/// Drive the child to completion: forward stdout and stderr, honour a kill
/// request, and finish with an `Exit` event. Consumes the child.
pub async fn run(spawned: Spawned, kill: oneshot::Receiver<()>, on_event: Channel<ProcEvent>) {
    let Spawned { mut child, stdin } = spawned;
    let _ = on_event.send(ProcEvent::Started { pid: child.id() });

    // Both pipes feed one ordered queue so the channel sees a single writer.
    let (tx, mut rx) = mpsc::channel::<ProcEvent>(256);

    if let Some(stdout) = child.stdout.take() {
        tokio::spawn(pump(stdout, tx.clone(), |text| ProcEvent::Stdout { text }));
    }
    if let Some(stderr) = child.stderr.take() {
        tokio::spawn(pump(stderr, tx.clone(), |text| ProcEvent::Stderr { text }));
    }
    drop(tx);

    // Forward concurrently with waiting on the child: output must reach the
    // frontend while the program runs, not after it exits, and the pumps
    // would block once the queue filled if nobody drained it.
    let forwarder = {
        let on_event = on_event.clone();
        tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                if on_event.send(event).is_err() {
                    break;
                }
            }
        })
    };

    let status = tokio::select! {
        status = child.wait() => status,
        _ = kill => {
            let _ = child.start_kill();
            child.wait().await
        }
    };

    // Drain whatever the pumps still hold after the child has exited.
    let _ = forwarder.await;
    // Make sure stdin is released even if the frontend never closed it.
    stdin.lock().await.take();

    let event = match status {
        Ok(status) => ProcEvent::Exit {
            code: status.code(),
            signal: unix_signal(&status),
        },
        Err(err) => ProcEvent::Croak {
            message: format!("waiting for process: {err}"),
        },
    };
    let _ = on_event.send(event);
}

async fn pump<R>(mut reader: R, tx: mpsc::Sender<ProcEvent>, wrap: fn(String) -> ProcEvent)
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut decoder = Utf8Stream::new();
    let mut buf = vec![0u8; READ_CHUNK];
    loop {
        match reader.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => {
                let text = decoder.push(&buf[..n]);
                if !text.is_empty() && tx.send(wrap(text)).await.is_err() {
                    break;
                }
            }
            Err(err) => {
                let _ = tx
                    .send(ProcEvent::Croak {
                        message: format!("reading process output: {err}"),
                    })
                    .await;
                break;
            }
        }
    }
    let rest = decoder.finish();
    if !rest.is_empty() {
        let _ = tx.send(wrap(rest)).await;
    }
}

#[cfg(unix)]
fn unix_signal(status: &std::process::ExitStatus) -> Option<i32> {
    use std::os::unix::process::ExitStatusExt;
    status.signal()
}

#[cfg(not(unix))]
fn unix_signal(_status: &std::process::ExitStatus) -> Option<i32> {
    None
}
