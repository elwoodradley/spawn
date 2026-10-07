//! Language-server transport: run a server (pyright) over stdio and move
//! whole JSON-RPC messages between it and the webview.
//!
//! Framing happens here on raw bytes (see `framing.rs`), because the
//! `Content-Length` header counts UTF-8 bytes and the general process layer
//! decodes text. Rust does not read the JSON; the frontend's LSP client does.

mod framing;

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;
use tauri::ipc::Channel;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use tokio::sync::{mpsc, oneshot};

use crate::error::{Error, Result};
use crate::proc::{kill_tree, prepare};
use framing::{Deframer, frame};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspStartRequest {
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub cwd: Option<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LspEvent {
    /// One complete JSON-RPC message from the server.
    Message {
        json: String,
    },
    /// A line the server wrote to stderr (pyright logs there).
    Log {
        text: String,
    },
    Exit {
        code: Option<i32>,
    },
    Croak {
        message: String,
    },
}

struct Handle {
    pid: Option<u32>,
    outgoing: mpsc::UnboundedSender<String>,
    kill: Option<oneshot::Sender<()>>,
}

#[derive(Default)]
pub struct LspRegistry {
    next_id: std::sync::Mutex<u32>,
    servers: std::sync::Mutex<HashMap<u32, Handle>>,
}

impl LspRegistry {
    /// Kill every server and its descendants, synchronously, at app exit.
    pub fn kill_all(&self) {
        let pids: Vec<u32> = lock(&self.servers).values().filter_map(|h| h.pid).collect();
        for pid in pids {
            kill_tree(pid);
        }
    }
}

fn lock<T>(m: &std::sync::Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    match m.lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    }
}

#[tauri::command]
pub async fn lsp_start(
    registry: State<'_, Arc<LspRegistry>>,
    request: LspStartRequest,
    on_event: Channel<LspEvent>,
) -> Result<u32> {
    let mut cmd = Command::new(&request.program);
    cmd.args(&request.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if let Some(cwd) = &request.cwd {
        cmd.current_dir(cwd);
    }
    for (k, v) in &request.env {
        cmd.env(k, v);
    }
    // Own process group / no console window; a `.cmd` shim or uv starts
    // node underneath, which must die with it.
    prepare(&mut cmd);

    let mut child = cmd.spawn()?;
    let pid = child.id();
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| Error::Message("language server has no stdin".into()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| Error::Message("language server has no stdout".into()))?;
    let stderr = child.stderr.take();

    let id = {
        let mut next = lock(&registry.next_id);
        *next += 1;
        *next
    };
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let (kill_tx, kill_rx) = oneshot::channel::<()>();
    lock(&registry.servers).insert(
        id,
        Handle {
            pid,
            outgoing: tx,
            kill: Some(kill_tx),
        },
    );

    // Writer: frame each outgoing message.
    tokio::spawn(async move {
        while let Some(body) = rx.recv().await {
            if stdin.write_all(&frame(&body)).await.is_err() {
                break;
            }
            if stdin.flush().await.is_err() {
                break;
            }
        }
    });

    // Reader: deframe stdout into whole messages.
    let events = on_event.clone();
    let reader = tokio::spawn(async move {
        let mut stdout = stdout;
        let mut deframer = Deframer::new();
        let mut buf = vec![0u8; 64 * 1024];
        loop {
            match stdout.read(&mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    for json in deframer.push(&buf[..n]) {
                        if events.send(LspEvent::Message { json }).is_err() {
                            return;
                        }
                    }
                }
            }
        }
    });

    // Stderr: forward as log lines, decoded leniently.
    if let Some(stderr) = stderr {
        let events = on_event.clone();
        tokio::spawn(async move {
            let mut stderr = stderr;
            let mut buf = vec![0u8; 8 * 1024];
            let mut pending = String::new();
            loop {
                match stderr.read(&mut buf).await {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        pending.push_str(&String::from_utf8_lossy(&buf[..n]));
                        while let Some(pos) = pending.find('\n') {
                            let line = pending[..pos].trim_end().to_owned();
                            pending.drain(..=pos);
                            if !line.is_empty()
                                && events.send(LspEvent::Log { text: line }).is_err()
                            {
                                return;
                            }
                        }
                    }
                }
            }
        });
    }

    let registry_for_task = Arc::clone(&registry);
    tokio::spawn(async move {
        let status = tokio::select! {
            status = child.wait() => status,
            _ = kill_rx => {
                if let Some(pid) = child.id() {
                    let _ = tokio::task::spawn_blocking(move || kill_tree(pid)).await;
                }
                let _ = child.start_kill();
                child.wait().await
            }
        };
        reader.abort();
        lock(&registry_for_task.servers).remove(&id);
        let event = match status {
            Ok(status) => LspEvent::Exit {
                code: status.code(),
            },
            Err(err) => LspEvent::Croak {
                message: format!("waiting for language server: {err}"),
            },
        };
        let _ = on_event.send(event);
    });

    Ok(id)
}

/// Queue one JSON-RPC message (already serialised) for the server.
#[tauri::command]
pub async fn lsp_send(registry: State<'_, Arc<LspRegistry>>, id: u32, json: String) -> Result<()> {
    let sender = lock(&registry.servers)
        .get(&id)
        .map(|h| h.outgoing.clone())
        .ok_or(Error::NoSuchProcess(id))?;
    sender
        .send(json)
        .map_err(|_| Error::Message(format!("language server {id} is gone")))
}

#[tauri::command]
pub async fn lsp_stop(registry: State<'_, Arc<LspRegistry>>, id: u32) -> Result<()> {
    let kill = lock(&registry.servers)
        .get_mut(&id)
        .and_then(|h| h.kill.take());
    if let Some(kill) = kill {
        let _ = kill.send(());
    }
    Ok(())
}
