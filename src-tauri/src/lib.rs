//! SPAWN's Rust side. Deliberately thin: processes, interpreter discovery, and
//! the Tauri plugins that give the frontend files, dialogs, and a settings
//! store. Everything that decides *what* to run lives in TypeScript.

mod env;
mod error;
mod lsp;
mod pool;
mod proc;

use std::sync::Arc;

/// Open the platform print dialog for the current page. The frontend swaps in
/// a print stylesheet first so only the active file's source is on the page.
#[tauri::command]
fn print_page(webview: tauri::Webview) -> error::Result<()> {
    webview
        .print()
        .map_err(|err| error::Error::Message(format!("print: {err}")))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    linux_render_compat();
    // A Finder or desktop launch lacks ~/.local/bin, /opt/homebrew/bin and
    // friends; without them uv, pyright and node are not found.
    env::locations::extend_process_path();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .manage(Arc::new(proc::ProcRegistry::default()))
        .manage(Arc::new(pool::PoolRegistry::default()))
        .manage(Arc::new(lsp::LspRegistry::default()))
        .invoke_handler(tauri::generate_handler![
            proc::proc_spawn,
            proc::proc_write,
            proc::proc_close_stdin,
            proc::proc_kill,
            pool::pool_start,
            pool::pool_send,
            pool::pool_interrupt,
            lsp::lsp_start,
            lsp::lsp_send,
            lsp::lsp_stop,
            env::env_discover,
            env::env_probe,
            env::env_uv_path,
            env::env_which,
            env::ml::env_probe_ml,
            env::ml::sys_memory,
            print_page,
        ])
        .build(tauri::generate_context!())
        .unwrap_or_else(|err| {
            eprintln!("spawn: could not start: {err}");
            std::process::exit(1);
        })
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                stop_children(app);
            }
        });
}

/// Kill runs, the Interactive Console and the language server when SPAWN
/// quits. Tauri exits the process directly, so the async tasks that own the
/// children are never dropped and `kill_on_drop` alone would leave a
/// training run or a busy kernel running with no window.
fn stop_children(app: &tauri::AppHandle) {
    use tauri::Manager;
    app.state::<Arc<proc::ProcRegistry>>().kill_all();
    app.state::<Arc<lsp::LspRegistry>>().kill_all();
}

/// WebKitGTK can paint a blank window on some Wayland + GPU driver
/// combinations. The documented fix is an environment variable set before the
/// webview exists. We do not force it on everyone; a user who hits the blank
/// window can set `SPAWN_SAFE_RENDER=1` and we translate it here.
fn linux_render_compat() {
    #[cfg(target_os = "linux")]
    if std::env::var_os("SPAWN_SAFE_RENDER").is_some() {
        // SAFETY: called before any other thread exists (first line of run()).
        unsafe {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }
}
