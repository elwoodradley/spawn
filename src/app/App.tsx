/** The window: menu bar, sidebar, tabs + editor, output panel, status bar. */
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  createEffect,
  createSignal,
  getOwner,
  onCleanup,
  onMount,
  runWithOwner,
  Show,
} from "solid-js";

import { startBroodTree } from "../brood/store";
import { registerCheckCommands } from "../check/commands";
import { installDatasetChecks } from "../dataset/checks";
import { isDirty, saveAllDirty, syncAllFromDisk } from "../editor/documents";
import Editor from "../editor/Editor";
import { installInlineValues } from "../editor/inlineValues/install";
import { installNudges } from "../nudges/store";
import DocxView from "../viewer/DocxView";
import { isViewerPath } from "../viewer/docx";
import { baseName, onMenuCommand } from "../ipc";
import OutputPanel from "../output/OutputPanel";
import { attachPoolEvents } from "../output/rich/attach";
import { registerPoolCommands } from "../pool/commands";
import { installLivePool } from "../pool/live";
import { registerLspCommands } from "../lsp/commands";
import MissingBanner from "../lsp/MissingBanner";
import { installLanguageServer } from "../lsp/server";
import { installProjectSettings } from "./project";
import { output } from "../spawn/controller";
import { registerSpawnCommands } from "../spawn/commands";
import { installRunHistory } from "../spawn/runStore";
import { initTheme } from "../theme/store";
import { loadSettings } from "./settings";
import CommandPalette from "../ui/CommandPalette";
import ThemePicker from "../ui/ThemePicker";
import ContextMenuHost from "../ui/ContextMenu";
import DialogHost from "../ui/Dialog";
import MenuBar from "../ui/MenuBar";
import SettingsDialog from "../ui/SettingsDialog";
import Icon from "../ui/Icon";
import Sidebar from "../ui/Sidebar";
import Splitter from "../ui/Splitter";
import StatusBar from "../ui/StatusBar";
import Tabs from "../ui/Tabs";
import ToastHost from "../ui/Toast";
import { PRINT_HOST_ID, registerAppCommands } from "./appCommands";
import { appMenus } from "./appMenus";
import { autosaveClutch, restoreClutch } from "./clutch";
import { runCommand } from "./commands";
import { registerEditCommands } from "./editCommands";
import { chordLabel, installKeybindings } from "./keybindings";
import {
  OUTPUT_DEFAULT,
  SIDEBAR_DEFAULT,
  clampOutput,
  clampSidebar,
  outputHeight,
  outputVisible,
  setOutputHeight,
  setSidebarVisible,
  setSidebarWidth,
  sidebarVisible,
  sidebarWidth,
} from "./layout";
import { loadRecent } from "./recent";
import { settings } from "./settings";
import { activeFilePath, brood } from "./state";
import { croakToast } from "./toast";
import { registerViewCommands } from "./viewCommands";
import Welcome from "./Welcome";
import { dropHover, installCloseGuard, installDragDrop } from "./window";
import "./App.css";

function windowTitle(path: string | null, root: string | null, dirty: boolean): string {
  const parts = [];
  if (path) parts.push(`${dirty ? "● " : ""}${baseName(path)}`);
  if (root) parts.push(baseName(root));
  parts.push("SPAWN");
  return parts.join(" — ");
}

export default function App() {
  const [ready, setReady] = createSignal(false);
  let main: HTMLDivElement | undefined;

  registerAppCommands();
  onCleanup(registerEditCommands());
  onCleanup(registerViewCommands());
  onCleanup(registerPoolCommands());
  onCleanup(installLivePool());
  onCleanup(installLanguageServer());
  onCleanup(installProjectSettings());
  onCleanup(installRunHistory());
  onCleanup(registerLspCommands());
  onCleanup(registerCheckCommands());
  onCleanup(attachPoolEvents(output));
  onCleanup(installDatasetChecks());
  onCleanup(installInlineValues());
  onCleanup(installNudges());
  startBroodTree();

  onMount(() => {
    const disposeSpawn = registerSpawnCommands();
    const uninstall = installKeybindings();
    const unlisteners: Array<() => void> = [];
    void installCloseGuard().then((fn) => unlisteners.push(fn));
    void installDragDrop().then((fn) => unlisteners.push(fn));
    // macOS menu bar items (Close Tab, Quit) arrive as command ids.
    void onMenuCommand((id) => void runCommand(id)).then((fn) => unlisteners.push(fn));
    // Autosave "when switching windows": save everything on blur.
    const onBlur = () => {
      if (settings().editor.autosave === "onFocusChange") void saveAllDirty();
    };
    window.addEventListener("blur", onBlur);
    // Coming back from another editor or a terminal: pick up their changes.
    // (The project watcher covers files inside the project while focused.)
    const onFocus = () => void syncAllFromDisk();
    window.addEventListener("focus", onFocus);
    onCleanup(() => {
      disposeSpawn();
      uninstall();
      unlisteners.forEach((fn) => fn());
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    });
    // After the awaits the reactive owner is gone, so re-enter it explicitly
    // or the autosave effect would never be disposed with the component.
    const owner = getOwner();
    void (async () => {
      await loadSettings();
      await initTheme();
      await loadRecent();
      await restoreClutch();
      runWithOwner(owner, autosaveClutch);
      setReady(true);
    })().catch((err: unknown) => {
      console.error("SPAWN startup failed", err);
      croakToast(`Startup failed: ${err instanceof Error ? err.message : String(err)}`);
      setReady(true);
    });
  });

  createEffect(() => {
    const path = activeFilePath();
    const title = windowTitle(path, brood(), path ? isDirty(path) : false);
    getCurrentWindow()
      .setTitle(title)
      .catch(() => {
        /* outside Tauri there is no window to title */
      });
  });

  return (
    <div class="sp-app" classList={{ "is-ready": ready(), "is-drop-target": dropHover() }}>
      <MenuBar menus={appMenus} />
      <div class="sp-main" ref={(el) => (main = el)}>
        <Show
          when={sidebarVisible()}
          fallback={
            <div class="sp-sidebar-rail sp-chrome sp-no-print">
              <button
                class="sp-sidebar-rail__button"
                title={`Show sidebar (${chordLabel("Mod-B")})`}
                aria-label="Show sidebar"
                onClick={() => setSidebarVisible(true)}
              >
                <Icon name="chevron-right" size={14} />
              </button>
            </div>
          }
        >
          <aside class="sp-sidebar sp-chrome sp-no-print" style={{ width: `${sidebarWidth()}px` }}>
            <Sidebar />
          </aside>
          <div class="sp-chrome sp-no-print">
            <Splitter
              direction="vertical"
              label="Resize the sidebar"
              onDrag={(delta) =>
                setSidebarWidth(
                  clampSidebar(sidebarWidth() + delta, (main?.clientWidth ?? 1200) * 0.6),
                )
              }
              onReset={() => setSidebarWidth(SIDEBAR_DEFAULT)}
            />
          </div>
        </Show>
        <div class="sp-center">
          <Show when={brood() || activeFilePath()} fallback={<Welcome />}>
            <div class="sp-chrome sp-no-print">
              <Tabs />
            </div>
            <div class="sp-editor-area sp-no-print" hidden={isViewerPath(activeFilePath())}>
              <MissingBanner />
              <Editor />
            </div>
            {/* Keyed: the viewer gets a plain path, so its cleanup (which saves the
                scroll position under that path) can still read it after the
                active tab has moved to a code file. Unkeyed, that read threw
                "stale value from <Show>" and the tab switch never happened. */}
            <Show when={isViewerPath(activeFilePath()) ? activeFilePath() : null} keyed>
              {(path) => (
                <div class="sp-editor-area sp-chrome">
                  <DocxView path={path} />
                </div>
              )}
            </Show>
            <Show when={outputVisible()}>
              <div class="sp-chrome sp-no-print">
                <Splitter
                  direction="horizontal"
                  label="Resize the output panel"
                  onDrag={(delta) =>
                    setOutputHeight(
                      clampOutput(outputHeight() - delta, (main?.clientHeight ?? 800) * 0.8),
                    )
                  }
                  onReset={() => setOutputHeight(OUTPUT_DEFAULT)}
                />
              </div>
              <div
                class="sp-output-area sp-chrome sp-no-print"
                style={{ height: `${outputHeight()}px` }}
              >
                <OutputPanel />
              </div>
            </Show>
          </Show>
        </div>
      </div>
      <div class="sp-chrome sp-no-print">
        <StatusBar />
      </div>
      <div class="sp-chrome sp-no-print">
        <CommandPalette />
        <ThemePicker />
        <ContextMenuHost />
        <DialogHost />
        <SettingsDialog />
        <ToastHost />
      </div>
      <Show when={dropHover()}>
        <div class="sp-drop-overlay sp-no-print" aria-hidden="true">
          Drop a folder to open it as a project, or files to open them
        </div>
      </Show>
      <pre id={PRINT_HOST_ID} class="sp-print-only" />
    </div>
  );
}
