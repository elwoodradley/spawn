/**
 * Choose Theme: every theme in a filterable list, each with a few colour
 * swatches. Moving through the list previews the theme on the whole app;
 * Enter keeps it, Escape (or clicking outside) goes back to the theme you
 * had when the picker opened.
 */
import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js";

import { currentTheme, selectTheme, themes } from "../theme/store";
import type { Theme } from "../theme/schema";
import Icon from "./Icon";
import "./CommandPalette.css";
import "./ThemePicker.css";

const [isOpen, setOpen] = createSignal(false);

export function openThemePicker(): void {
  setOpen(true);
}

/** Themes whose name matches every word typed, dark ones before light. */
export function filterThemes(list: readonly Theme[], query: string): Theme[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (t: Theme) => {
    const hay = `${t.name} ${t.appearance}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  return list.filter(hit);
}

function swatches(theme: Theme): string[] {
  const s = theme.syntax;
  return [
    theme.colors.bg,
    theme.colors.accent,
    s.keyword?.color ?? theme.colors.fg,
    s.string?.color ?? theme.colors.fg,
    s.function?.color ?? theme.colors.fg,
    s.number?.color ?? theme.colors.fg,
  ];
}

export default function ThemePicker() {
  const [query, setQuery] = createSignal("");
  const [index, setIndex] = createSignal(0);
  const [original, setOriginal] = createSignal("");
  let input: HTMLInputElement | undefined;
  let list: HTMLUListElement | undefined;

  const results = createMemo(() => filterThemes(themes(), query()));

  createEffect(
    on(isOpen, (open) => {
      if (!open) return;
      const name = currentTheme().name;
      setOriginal(name);
      setQuery("");
      setIndex(
        Math.max(
          0,
          results().findIndex((t) => t.name === name),
        ),
      );
      queueMicrotask(() => input?.focus());
    }),
  );

  // Preview whatever is highlighted, without saving it.
  createEffect(
    on([index, results], ([i, found]) => {
      if (!isOpen()) return;
      const theme = found[i];
      if (theme && theme.name !== currentTheme().name) selectTheme(theme.name, false);
      queueMicrotask(() =>
        list?.querySelector(".is-selected")?.scrollIntoView({ block: "nearest" }),
      );
    }),
  );

  const cancel = () => {
    selectTheme(original(), false);
    setOpen(false);
  };

  const keep = (theme: Theme | undefined) => {
    if (theme) selectTheme(theme.name);
    else selectTheme(original(), false);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const count = results().length;
    if (e.key === "Escape") cancel();
    else if (e.key === "ArrowDown") setIndex((i) => (count ? (i + 1) % count : 0));
    else if (e.key === "ArrowUp") setIndex((i) => (count ? (i - 1 + count) % count : 0));
    else if (e.key === "Enter") keep(results()[index()]);
    else return;
    e.preventDefault();
  };

  return (
    <Show when={isOpen()}>
      <div class="sp-palette-backdrop" onClick={cancel}>
        <div
          class="sp-palette sp-theme-picker"
          role="dialog"
          aria-label="Choose a theme"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="sp-palette-input">
            <Icon name="search" />
            <input
              ref={(el) => (input = el)}
              type="text"
              placeholder="Choose a theme (arrows preview, Enter keeps, Escape cancels)"
              value={query()}
              onInput={(e) => {
                setQuery(e.currentTarget.value);
                setIndex(0);
              }}
              onKeyDown={onKeyDown}
            />
          </div>
          <ul class="sp-palette-list" role="listbox" ref={(el) => (list = el)}>
            <For each={results()}>
              {(theme, i) => (
                <li
                  class="sp-palette-item sp-theme-item"
                  classList={{ "is-selected": i() === index() }}
                  role="option"
                  aria-selected={i() === index()}
                  onMouseEnter={() => setIndex(i())}
                  onClick={() => keep(theme)}
                >
                  <span class="sp-theme-name">
                    {theme.name}
                    <Show when={theme.name === original()}>
                      <span class="sp-theme-current">current</span>
                    </Show>
                  </span>
                  <span class="sp-theme-meta">
                    <span class="sp-theme-kind">{theme.appearance}</span>
                    <span class="sp-theme-swatches" aria-hidden="true">
                      <For each={swatches(theme)}>
                        {(color) => <span class="sp-theme-swatch" style={{ background: color }} />}
                      </For>
                    </span>
                  </span>
                </li>
              )}
            </For>
            <Show when={results().length === 0}>
              <li class="sp-palette-empty">No theme matches.</li>
            </Show>
          </ul>
        </div>
      </div>
    </Show>
  );
}
