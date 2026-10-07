//! The pool: a persistent Python kernel SPAWN talks to over a local socket.
//!
//! `pool.py` (stdlib only) is written to the app cache dir and launched with
//! the user's interpreter. Its stdout and stderr stream like any spawn; the
//! protocol rides a loopback TCP connection that only the child can open,
//! because the first line it must send is a random token handed to it through
//! the environment. Rust is a dumb pipe: JSON lines in, JSON lines out.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use rand::RngCore;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use tokio::sync::mpsc;

use crate::error::{Error, Result};
use crate::proc::{ProcEvent, ProcRegistry, SpawnRequest, launch};

const POOL_SOURCE: &str = include_str!("pool.py");
/// Dataset health checks; pool.py loads it from beside itself on demand.
const POOL_HEALTH_SOURCE: &str = include_str!("pool_health.py");
const ACCEPT_TIMEOUT: Duration = Duration::from_secs(20);

/// Live pool connections keyed by the process id `launch` returned.
#[derive(Default)]
pub struct PoolRegistry {
    writers: std::sync::Mutex<HashMap<u32, mpsc::UnboundedSender<String>>>,
}

impl PoolRegistry {
    fn writer(&self, id: u32) -> Result<mpsc::UnboundedSender<String>> {
        lock(&self.writers)
            .get(&id)
            .cloned()
            .ok_or(Error::NoSuchProcess(id))
    }
    fn insert(&self, id: u32, tx: mpsc::UnboundedSender<String>) {
        lock(&self.writers).insert(id, tx);
    }
    fn remove(&self, id: u32) {
        lock(&self.writers).remove(&id);
    }
}

fn lock<T>(m: &std::sync::Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    match m.lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn token() -> String {
    let mut bytes = [0u8; 24];
    rand::rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Write the kernel script where the interpreter can read it.
fn install_script(app: &AppHandle) -> Result<std::path::PathBuf> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|err| Error::Message(format!("no cache dir: {err}")))?
        .join("pool");
    std::fs::create_dir_all(&dir)?;
    write_if_changed(&dir.join("pool_health.py"), POOL_HEALTH_SOURCE)?;
    let path = dir.join("pool.py");
    write_if_changed(&path, POOL_SOURCE)?;
    Ok(path)
}

/// Rewrite only when the content changed, so the file's mtime stays stable.
fn write_if_changed(path: &std::path::Path, source: &str) -> Result<()> {
    if std::fs::read_to_string(path).ok().as_deref() != Some(source) {
        std::fs::write(path, source)?;
    }
    Ok(())
}

/// Start a pool. Process output arrives on `on_proc`, protocol lines on
/// `on_message`, ending with `{"event":"closed"}` when the socket drops.
#[tauri::command]
pub async fn pool_start(
    app: AppHandle,
    procs: State<'_, Arc<ProcRegistry>>,
    pools: State<'_, Arc<PoolRegistry>>,
    python: String,
    cwd: Option<String>,
    on_proc: Channel<ProcEvent>,
    on_message: Channel<String>,
) -> Result<u32> {
    let script = install_script(&app)?;
    let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
    let port = listener.local_addr()?.port();
    let secret = token();

    let mut env = HashMap::new();
    env.insert("SPAWN_POOL_PORT".into(), port.to_string());
    env.insert("SPAWN_POOL_TOKEN".into(), secret.clone());
    env.insert("MPLBACKEND".into(), "Agg".into());
    env.insert("PYTHONUNBUFFERED".into(), "1".into());
    env.insert("PYTHONIOENCODING".into(), "utf-8".into());

    let request = SpawnRequest {
        program: python,
        args: vec!["-u".into(), script.to_string_lossy().into_owned()],
        cwd,
        env,
    };
    let id = launch(&procs, &request, on_proc)?;

    let (tx, rx) = mpsc::unbounded_channel::<String>();
    pools.insert(id, tx);
    let pools_for_task = Arc::clone(&pools);
    tokio::spawn(async move {
        serve(listener, secret, rx, &on_message).await;
        pools_for_task.remove(id);
        let _ = on_message.send(r#"{"event":"closed"}"#.to_owned());
    });

    Ok(id)
}

/// Accept the one connection, check the token, then pump both directions.
async fn serve(
    listener: TcpListener,
    secret: String,
    mut outgoing: mpsc::UnboundedReceiver<String>,
    on_message: &Channel<String>,
) {
    let accepted = tokio::time::timeout(ACCEPT_TIMEOUT, listener.accept()).await;
    let Ok(Ok((stream, _))) = accepted else {
        let _ =
            on_message.send(r#"{"event":"croak","message":"the pool never connected"}"#.to_owned());
        return;
    };
    drop(listener);

    let (read_half, mut write_half) = stream.into_split();
    let mut lines = BufReader::new(read_half).lines();

    match lines.next_line().await {
        Ok(Some(first)) if first.trim() == secret => {}
        _ => {
            let _ =
                on_message.send(r#"{"event":"croak","message":"pool token mismatch"}"#.to_owned());
            return;
        }
    }

    let writer = tokio::spawn(async move {
        while let Some(line) = outgoing.recv().await {
            if write_half.write_all(line.as_bytes()).await.is_err() {
                break;
            }
            if write_half.write_all(b"\n").await.is_err() {
                break;
            }
        }
    });

    while let Ok(Some(line)) = lines.next_line().await {
        if on_message.send(line).is_err() {
            break;
        }
    }
    writer.abort();
}

/// Send one protocol line (a JSON object) to the pool.
#[tauri::command]
pub async fn pool_send(pools: State<'_, Arc<PoolRegistry>>, id: u32, line: String) -> Result<()> {
    pools
        .writer(id)?
        .send(line)
        .map_err(|_| Error::Message(format!("pool {id} is gone")))
}

/// Interrupt whatever the pool is running: an interrupt op through the socket
/// on every platform (the kernel raises SIGINT in itself on Windows), plus a
/// real SIGINT on Unix so blocking calls wake up.
#[tauri::command]
pub async fn pool_interrupt(
    procs: State<'_, Arc<ProcRegistry>>,
    pools: State<'_, Arc<PoolRegistry>>,
    id: u32,
) -> Result<()> {
    if let Ok(writer) = pools.writer(id) {
        let _ = writer.send(r#"{"op":"interrupt"}"#.to_owned());
    }
    #[cfg(unix)]
    if let Some(pid) = procs.pid(id) {
        // SAFETY: plain syscall on a pid we spawned; a stale pid returns an error we ignore.
        unsafe {
            libc::kill(pid as libc::pid_t, libc::SIGINT);
        }
    }
    #[cfg(not(unix))]
    let _ = procs;
    Ok(())
}
