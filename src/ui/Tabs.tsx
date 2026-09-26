/**
 * The tab strip above the editor. Drag a tab to reorder it, right-click for
 * the close family, middle-click to close. Registers the tab commands while
 * mounted.
 */
import { createSignal, For, onCleanup, onMount } from "solid-js";

import { activeFilePath, closeTab, setActiveFilePath, setTabs, tabs } from "../app/state";
import { isDirty } from "../editor/documents";
import { showContextMenu } from "./ContextMenu";
import Icon from "./Icon";
import { registerTabCommands, tabMenu } from "./tabCommands";
import { reorder } from "./tabOrder";
import "./Tabs.css";

interface Drag {
  from: number;
  over: number;
  startX: number;
  moved: boolean;
}

export default function Tabs() {
  const [drag, setDrag] = createSignal<Drag | null>(null);
  let strip: HTMLDivElement | undefined;

  onMount(() => {
    const dispose = registerTabCommands();
    onCleanup(dispose);
  });

  /** Which tab index the pointer is over, from its x position. */
  const indexAt = (x: number): number => {
    if (!strip) return -1;
    const rows = [...strip.querySelectorAll<HTMLElement>(".sp-tab")];
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i]?.getBoundingClientRect();
      if (rect && x < rect.left + rect.width / 2) return i;
    }
    return rows.length - 1;
  };

  const onPointerDown = (e: PointerEvent, index: number) => {
    if (e.button !== 0) return;
    setDrag({ from: index, over: index, startX: e.clientX, moved: false });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag();
    if (!d) return;
    const moved = d.moved || Math.abs(e.clientX - d.startX) > 4;
    setDrag({ ...d, over: indexAt(e.clientX), moved });
  };

  const onPointerUp = (e: PointerEvent, path: string) => {
    const d = drag();
    setDrag(null);
    if (!d) return;
    if (d.moved && d.over !== -1 && d.over !== d.from) {
      setTabs(reorder(tabs(), d.from, d.over));
    } else if (e.button === 0) {
      setActiveFilePath(path);
    }
  };

  return (
    <div class="sp-tabs" role="tablist" ref={(el) => (strip = el)}>
      <For each={tabs()}>
        {(tab, i) => (
          <div
            class="sp-tab"
            classList={{
              "is-active": activeFilePath() === tab.path,
              "is-dirty": isDirty(tab.path),
              "is-dragging": drag()?.moved === true && drag()?.from === i(),
              "is-drop-before":
                drag()?.moved === true && drag()?.over === i() && drag()?.from !== i(),
            }}
            role="tab"
            aria-selected={activeFilePath() === tab.path}
            title={tab.path}
            onPointerDown={(e) => onPointerDown(e, i())}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => onPointerUp(e, tab.path)}
            onPointerCancel={() => setDrag(null)}
            onAuxClick={(e) => {
              if (e.button === 1) void closeTab(tab.path);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              showContextMenu(e.clientX, e.clientY, tabMenu(tab.path));
            }}
          >
            <span class="sp-tab-name">{tab.name}</span>
            <button
              class="sp-tab-close"
              aria-label={`Close ${tab.name}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                void closeTab(tab.path);
              }}
            >
              <Icon name={isDirty(tab.path) ? "dot" : "close"} size={12} />
            </button>
          </div>
        )}
      </For>
    </div>
  );
}
