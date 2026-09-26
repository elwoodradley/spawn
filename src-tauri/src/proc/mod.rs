//! Child-process management: the Rust side of a spawn.
//!
//! The frontend asks for a process with `proc_spawn`, passing a `Channel`.
//! Every byte the child writes arrives on that channel in order as a
//! `ProcEvent`, decoded to text with `Utf8Stream`. The frontend can write to
//! stdin, close stdin, or kill the child by id. Nothing here knows what Python
//! is; the same command will later run the pool and the language server.

mod child;
mod utf8;

use std::collections::HashMap;
use std::sync::Arc;

use serde::Deserialize;
use tauri::State;
use tauri::ipc::Channel;
use tokio::sync::{Mutex, oneshot};

use crate::error::{Error, Result};

pub use child::ProcEvent;

/// What the frontend sends to start a process.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnRequest {
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub cwd: Option<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

/// Handles the registry keeps for a live child.
struct Handle {
    pid: Option<u32>,
    stdin: Arc<Mutex<Option<tokio::process::ChildStdin>>>,
    kill: Option<oneshot::Sender<()>>,
}

/// All live children, keyed by a SPAWN-side id (not the OS pid, which the
/// frontend never needs and which can be reused by the OS).
#[derive(Default)]
pub struct ProcRegistry {
    next_id: std::sync::Mutex<u32>,
    procs: std::sync::Mutex<HashMap<u32, Handle>>,
}

impl ProcRegistry {
    fn allocate_id(&self) -> u32 {
        let mut next = lock_or_recover(&self.next_id);
        *next += 1;
        *next
    }

    fn insert(&self, id: u32, handle: Handle) {
        lock_or_recover(&self.procs).insert(id, handle);
    }

    fn remove(&self, id: u32) -> Option<Handle> {
        lock_or_recover(&self.procs).remove(&id)
    }

    /// OS pid of a live child, for signalling.
    pub fn pid(&self, id: u32) -> Option<u32> {
        lock_or_recover(&self.procs).get(&id).and_then(|h| h.pid)
    }

    fn stdin(&self, id: u32) -> Result<Arc<Mutex<Option<tokio::process::ChildStdin>>>> {
        lock_or_recover(&self.procs)
            .get(&id)
            .map(|h| Arc::clone(&h.stdin))
            .ok_or(Error::NoSuchProcess(id))
    }
}

/// A poisoned mutex only means another thread panicked while holding it; the
/// map itself is still usable, so recover rather than propagate the panic.
fn lock_or_recover<T>(m: &std::sync::Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    match m.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

/// Start a child, register it, and pump its output to `on_event`. Shared by
/// plain spawns and the pool, which adds a socket on top.
pub fn launch(
    registry: &Arc<ProcRegistry>,
    request: &SpawnRequest,
    on_event: Channel<ProcEvent>,
) -> Result<u32> {
    let id = registry.allocate_id();
    let (kill_tx, kill_rx) = oneshot::channel();
    let spawned = child::spawn(request)?;

    registry.insert(
        id,
        Handle {
            pid: spawned.pid(),
            stdin: Arc::clone(&spawned.stdin),
            kill: Some(kill_tx),
        },
    );

    let registry_for_task = Arc::clone(registry);
    tokio::spawn(async move {
        child::run(spawned, kill_rx, on_event).await;
        registry_for_task.remove(id);
    });

    Ok(id)
}

#[tauri::command]
pub async fn proc_spawn(
    registry: State<'_, Arc<ProcRegistry>>,
    request: SpawnRequest,
    on_event: Channel<ProcEvent>,
) -> Result<u32> {
    launch(&registry, &request, on_event)
}

#[tauri::command]
pub async fn proc_write(
    registry: State<'_, Arc<ProcRegistry>>,
    id: u32,
    data: String,
) -> Result<()> {
    use tokio::io::AsyncWriteExt;
    let stdin = registry.stdin(id)?;
    let mut guard = stdin.lock().await;
    let pipe = guard.as_mut().ok_or(Error::StdinClosed(id))?;
    pipe.write_all(data.as_bytes()).await?;
    pipe.flush().await?;
    Ok(())
}

#[tauri::command]
pub async fn proc_close_stdin(registry: State<'_, Arc<ProcRegistry>>, id: u32) -> Result<()> {
    let stdin = registry.stdin(id)?;
    // Dropping the pipe sends EOF; Python's input() then raises EOFError.
    stdin.lock().await.take();
    Ok(())
}

#[tauri::command]
pub async fn proc_kill(registry: State<'_, Arc<ProcRegistry>>, id: u32) -> Result<()> {
    let mut handle = registry.remove(id).ok_or(Error::NoSuchProcess(id))?;
    if let Some(kill) = handle.kill.take() {
        // The receiver may already be gone if the child exited on its own.
        let _ = kill.send(());
    }
    Ok(())
}
