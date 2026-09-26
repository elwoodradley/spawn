/**
 * The menu bar. Themed HTML rather than native menus so it looks the same on
 * every platform and follows the theme tokens. Click opens, hover switches
 * between open menus, arrows navigate, Escape or an outside click closes.
 */
import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";

import Icon from "./Icon";
import { activateEntry, resolveEntry, type Menu, type MenuEntry } from "./menus";
import "./MenuBar.css";

function MenuList(props: {
  items: MenuEntry[];
  onPick: (entry: MenuEntry) => void;
  focusIndex: number | null;
}) {
  const [openSub, setOpenSub] = createSignal<number | null>(null);
  const resolved = () => props.items.map(resolveEntry);

  // Keyboard focus moved off a submenu parent closes it.
  createEffect(
    on(
      () => props.focusIndex,
      (i) => {
        if (i !== null && i !== openSub()) setOpenSub(null);
      },
    ),
  );

  return (
    <div class="sp-menu" role="menu">
      <For each={resolved()}>
        {(item, i) => (
          <Show
            when={!item.separator}
            fallback={<div class="sp-menu__separator" role="separator" />}
          >
            <button
              class="sp-menu__item"
              classList={{ "is-active": props.focusIndex === i() || openSub() === i() }}
              role="menuitem"
              disabled={item.disabled}
              aria-haspopup={item.hasSubmenu ? "menu" : undefined}
              onMouseEnter={() => setOpenSub(item.hasSubmenu ? i() : null)}
              onClick={() => {
                if (item.hasSubmenu) setOpenSub(i());
                else props.onPick(item.entry);
              }}
            >
              <span class="sp-menu__check">
                <Show when={item.checked}>
                  <Icon name="check" size={12} />
                </Show>
              </span>
              <span class="sp-menu__label">{item.label}</span>
              <Show when={item.keys}>
                <kbd class="sp-menu__keys">{item.keys}</kbd>
              </Show>
              <Show when={item.hasSubmenu}>
                <span class="sp-menu__arrow">
                  <Icon name="chevron-right" size={12} />
                </span>
              </Show>
              <Show when={item.hasSubmenu && openSub() === i() && item.entry.kind === "submenu"}>
                <div class="sp-menu--sub" onClick={(e) => e.stopPropagation()}>
                  <Show
                    when={item.entry.kind === "submenu" && item.entry.items.length > 0}
                    fallback={
                      <div class="sp-menu">
                        <div class="sp-menu__empty">Nothing yet</div>
                      </div>
                    }
                  >
                    <MenuList
                      items={item.entry.kind === "submenu" ? item.entry.items : []}
                      onPick={props.onPick}
                      focusIndex={null}
                    />
                  </Show>
                </div>
              </Show>
            </button>
          </Show>
        )}
      </For>
    </div>
  );
}

export default function MenuBar(props: { menus: () => Menu[] }) {
  const [open, setOpen] = createSignal<number | null>(null);
  const [focus, setFocus] = createSignal<number | null>(null);
  let bar: HTMLDivElement | undefined;

  const close = () => {
    setOpen(null);
    setFocus(null);
  };

  const pick = (entry: MenuEntry) => {
    close();
    void activateEntry(entry);
  };

  const selectable = (menu: Menu) =>
    menu.items
      .map((entry, i) => ({ entry, i }))
      .filter(({ entry }) => !resolveEntry(entry).disabled);

  const move = (delta: number) => {
    const index = open();
    const menu = index === null ? undefined : props.menus()[index];
    if (!menu) return;
    const options = selectable(menu);
    if (options.length === 0) return;
    const current = options.findIndex((o) => o.i === focus());
    const next = options[(current + delta + options.length) % options.length];
    setFocus(next?.i ?? null);
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open() === null) return;
      const count = props.menus().length;
      switch (e.key) {
        case "Escape":
          close();
          break;
        case "ArrowLeft":
          setOpen((i) => (i === null ? 0 : (i - 1 + count) % count));
          setFocus(null);
          break;
        case "ArrowRight":
          setOpen((i) => (i === null ? 0 : (i + 1) % count));
          setFocus(null);
          break;
        case "ArrowDown":
          move(1);
          break;
        case "ArrowUp":
          move(-1);
          break;
        case "Enter": {
          const index = open();
          const entry = index === null ? undefined : props.menus()[index]?.items[focus() ?? -1];
          if (entry) pick(entry);
          break;
        }
        default:
          return;
      }
      e.preventDefault();
      e.stopPropagation();
    };
    const onPointer = (e: MouseEvent) => {
      if (open() !== null && bar && !bar.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("blur", close);
    onCleanup(() => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("blur", close);
    });
  });

  return (
    <div class="sp-menubar sp-chrome sp-no-print" role="menubar" ref={(el) => (bar = el)}>
      <span class="sp-menubar__brand" aria-hidden="true">
        SPAWN
      </span>
      <For each={props.menus()}>
        {(menu, i) => (
          <div class="sp-menubar__top">
            <button
              class="sp-menubar__button"
              classList={{ "is-open": open() === i() }}
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={open() === i()}
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(open() === i() ? null : i());
                setFocus(null);
              }}
              onMouseEnter={() => {
                if (open() !== null && open() !== i()) {
                  setOpen(i());
                  setFocus(null);
                }
              }}
            >
              {menu.label}
            </button>
            <Show when={open() === i()}>
              <div class="sp-menubar__dropdown">
                <MenuList items={menu.items} onPick={pick} focusIndex={focus()} />
              </div>
            </Show>
          </div>
        )}
      </For>
    </div>
  );
}
