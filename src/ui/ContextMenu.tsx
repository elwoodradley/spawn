/**
 * A right-click menu at a screen position. One at a time; any click, Escape
 * or window blur closes it. Entries are the same `MenuEntry` data the menu
 * bar uses.
 */
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { activateEntry, resolveEntry, type MenuEntry } from "./menus";
import "./MenuBar.css";

interface ContextMenuState {
  x: number;
  y: number;
  items: MenuEntry[];
}

const [menu, setMenu] = createSignal<ContextMenuState | null>(null);

export function showContextMenu(x: number, y: number, items: MenuEntry[]): void {
  setMenu({ x, y, items });
}

export function closeContextMenu(): void {
  setMenu(null);
}

export default function ContextMenuHost() {
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && menu()) {
        e.preventDefault();
        closeContextMenu();
      }
    };
    const onBlur = () => closeContextMenu();
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    onCleanup(() => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    });
  });

  const pick = (entry: MenuEntry) => {
    closeContextMenu();
    void activateEntry(entry);
  };

  /** Keep the menu inside the window. */
  const place = (el: HTMLDivElement, state: ContextMenuState) => {
    queueMicrotask(() => {
      const rect = el.getBoundingClientRect();
      const x = Math.min(state.x, window.innerWidth - rect.width - 4);
      const y = Math.min(state.y, window.innerHeight - rect.height - 4);
      el.style.left = `${Math.max(0, x)}px`;
      el.style.top = `${Math.max(0, y)}px`;
    });
  };

  return (
    <Show when={menu()}>
      {(state) => (
        <div
          class="sp-menu-backdrop"
          onMouseDown={closeContextMenu}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            class="sp-menu sp-menu--context"
            role="menu"
            ref={(el) => place(el, state())}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <For each={state().items.map(resolveEntry)}>
              {(item) => (
                <Show
                  when={!item.separator}
                  fallback={<div class="sp-menu__separator" role="separator" />}
                >
                  <button
                    class="sp-menu__item"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => pick(item.entry)}
                  >
                    <span class="sp-menu__label">{item.label}</span>
                    <Show when={item.keys}>
                      <kbd class="sp-menu__keys">{item.keys}</kbd>
                    </Show>
                  </button>
                </Show>
              )}
            </For>
          </div>
        </div>
      )}
    </Show>
  );
}
