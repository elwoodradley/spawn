//! The macOS menu bar.
//!
//! Tauri's default macOS menu binds Cmd+W to Close Window, Cmd+H to Hide and
//! Cmd+Q to an immediate quit, which takes those keys from SPAWN's own
//! commands (Close Tab, Find and Replace, Quit with the unsaved-changes
//! prompt). This menu keeps what macOS needs, the Edit items in particular
//! (WKWebView's clipboard and undo go through them), and turns Close Tab and
//! Quit into `menu-command` events carrying a frontend command id. Those
//! items have no accelerator: the keys reach the webview's keybindings, so a
//! shortcut can never run a command twice.
//!
//! Linux and Windows have no menu bar from Tauri and stay unchanged.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use tauri::menu::{Menu, MenuEvent, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Runtime};

/// Event the frontend listens to; the payload is a command id.
pub const MENU_COMMAND_EVENT: &str = "menu-command";

/// Menu ids that are frontend commands, sent as they are.
const COMMANDS: [(&str, &str); 2] = [("tab.close", "Close Tab"), ("app.quit", "Quit SPAWN")];

const HIDE: &str = "app.hide";

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let app_menu = SubmenuBuilder::new(app, "SPAWN")
        .about(None)
        .separator()
        .services()
        .separator()
        .text(HIDE, "Hide SPAWN")
        .show_all()
        .separator()
        .text(COMMANDS[1].0, COMMANDS[1].1)
        .build()?;
    let file = SubmenuBuilder::new(app, "File")
        .text(COMMANDS[0].0, COMMANDS[0].1)
        .build()?;
    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let window = SubmenuBuilder::new(app, "Window")
        .minimize()
        .fullscreen()
        .build()?;
    Menu::with_items(app, &[&app_menu, &file, &edit, &window])
}

pub fn on_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref();
    if id == HIDE {
        #[cfg(target_os = "macos")]
        let _ = app.hide();
        return;
    }
    if let Some(command) = frontend_command(id) {
        let _ = app.emit(MENU_COMMAND_EVENT, command);
    }
}

/// The frontend command a menu id stands for, if it is one.
fn frontend_command(id: &str) -> Option<&'static str> {
    COMMANDS
        .iter()
        .find(|(cmd, _)| *cmd == id)
        .map(|(cmd, _)| *cmd)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_known_ids_reach_the_frontend() {
        assert_eq!(frontend_command("tab.close"), Some("tab.close"));
        assert_eq!(frontend_command("app.quit"), Some("app.quit"));
        assert_eq!(frontend_command(HIDE), None);
        assert_eq!(frontend_command("fs.removeEverything"), None);
    }
}
