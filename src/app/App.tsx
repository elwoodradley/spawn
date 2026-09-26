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

import FileTree from "../brood/FileTree";
import { startBroodTree } from "../brood/store";
import { isDirty } from "../editor/documents";
import Editor from "../editor/Editor";
import { baseName } from "../ipc";
import OutputPanel from "../output/OutputPanel";
import { registerSpawnCommands } from "../spawn/commands";
import { initTheme } from "../theme/store";
import CommandPalette from "../ui/CommandPalette";
import ContextMenuHost from "../ui/ContextMenu";
import DialogHost from "../ui/Dialog";
import MenuBar from "../ui/MenuBar";
import Splitter from "../ui/Splitter";
import StatusBar from "../ui/StatusBar";
import Tabs from "../ui/Tabs";
import { PRINT_HOST_ID, registerAppCommands } from "./appCommands";
import { appMenus } from "./appMenus";
import { autosaveClutch, restoreClutch } from "./clutch";
import { registerEditCommands } from "./editCommands";
import { installKeybindings } from "./keybindings";
import {
  clampOutput,
  clampSidebar,
  outputHeight,
  outputVisible,
  setOutputHeight,
  setSidebarWidth,
  sidebarVisible,
  sidebarWidth,
} from "./layout";
import { loadRecent } from "./recent";
import { activeFilePath, brood } from "./state";
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
  startBroodTree();

  onMount(() => {
    const disposeSpawn = registerSpawnCommands();
    const uninstall = installKeybindings();
    const unlisteners: Array<() => void> = [];
    void installCloseGuard().then((fn) => unlisteners.push(fn));
    void installDragDrop().then((fn) => unlisteners.push(fn));
    onCleanup(() => {
      disposeSpawn();
      uninstall();
      unlisteners.forEach((fn) => fn());
    });
    // After the awaits the reactive owner is gone, so re-enter it explicitly
    // or the autosave effect would never be disposed with the component.
    const owner = getOwner();
    void (async () => {
      await initTheme();
      await loadRecent();
      await restoreClutch();
      runWithOwner(owner, autosaveClutch);
      setReady(true);
    })().catch((err: unknown) => {
      console.error("SPAWN startup failed", err);
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
        <Show when={sidebarVisible()}>
          <aside class="sp-sidebar sp-chrome sp-no-print" style={{ width: `${sidebarWidth()}px` }}>
            <FileTree />
          </aside>
          <div class="sp-chrome sp-no-print">
            <Splitter
              direction="vertical"
              onDrag={(delta) =>
                setSidebarWidth(
                  clampSidebar(sidebarWidth() + delta, (main?.clientWidth ?? 1200) * 0.6),
                )
              }
            />
          </div>
        </Show>
        <div class="sp-center">
          <Show when={brood() || activeFilePath()} fallback={<Welcome />}>
            <div class="sp-chrome sp-no-print">
              <Tabs />
            </div>
            <div class="sp-editor-area sp-no-print">
              <Editor />
            </div>
            <Show when={outputVisible()}>
              <div class="sp-chrome sp-no-print">
                <Splitter
                  direction="horizontal"
                  onDrag={(delta) =>
                    setOutputHeight(
                      clampOutput(outputHeight() - delta, (main?.clientHeight ?? 800) * 0.8),
                    )
                  }
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
        <ContextMenuHost />
        <DialogHost />
      </div>
      <Show when={dropHover()}>
        <div class="sp-drop-overlay sp-no-print" aria-hidden="true">
          Drop a folder to open it as a brood, or files to open them
        </div>
      </Show>
      <pre id={PRINT_HOST_ID} class="sp-print-only" />
    </div>
  );
}
