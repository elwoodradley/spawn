/** Mod-Shift-P: every command, filtered as you type. */
import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js";

import { listCommands, runCommand, type Command } from "../app/commands";
import { chordLabel } from "../app/keybindings";
import { addRecentCommand, recentCommands } from "../app/recent";
import { rankCommands } from "./fuzzy";
import Icon from "./Icon";
import "./CommandPalette.css";

const [isOpen, setOpen] = createSignal(false);

export function openPalette(): void {
  setOpen(true);
}

export function closePalette(): void {
  setOpen(false);
}

export default function CommandPalette() {
  const [query, setQuery] = createSignal("");
  const [index, setIndex] = createSignal(0);
  let input: HTMLInputElement | undefined;

  // With no query, the commands used most recently come first.
  const results = createMemo(() => {
    const ranked = rankCommands(
      listCommands().filter((c) => c.id !== "palette.open" && !c.hidden),
      query(),
    );
    if (query().length > 0) return ranked;
    const recent = recentCommands();
    const rank = (c: Command) => {
      const i = recent.indexOf(c.id);
      return i === -1 ? recent.length : i;
    };
    return [...ranked].sort((a, b) => rank(a) - rank(b));
  });

  createEffect(
    on(isOpen, (open) => {
      if (open) {
        setQuery("");
        setIndex(0);
        queueMicrotask(() => input?.focus());
      }
    }),
  );

  const pick = (command: Command | undefined) => {
    if (!command) return;
    closePalette();
    addRecentCommand(command.id);
    void runCommand(command.id);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const count = results().length;
    if (e.key === "Escape") closePalette();
    else if (e.key === "ArrowDown") setIndex((i) => (count ? (i + 1) % count : 0));
    else if (e.key === "ArrowUp") setIndex((i) => (count ? (i - 1 + count) % count : 0));
    else if (e.key === "Enter") pick(results()[index()]);
    else return;
    e.preventDefault();
  };

  return (
    <Show when={isOpen()}>
      <div class="sp-palette-backdrop" onClick={closePalette}>
        <div
          class="sp-palette"
          role="dialog"
          aria-label="Commands"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="sp-palette-input">
            <Icon name="search" />
            <input
              ref={(el) => (input = el)}
              type="text"
              placeholder="Type a command"
              value={query()}
              onInput={(e) => {
                setQuery(e.currentTarget.value);
                setIndex(0);
              }}
              onKeyDown={onKeyDown}
            />
          </div>
          <ul class="sp-palette-list" role="listbox">
            <For each={results()}>
              {(command, i) => (
                <li
                  class="sp-palette-item"
                  classList={{ "is-selected": i() === index() }}
                  role="option"
                  aria-selected={i() === index()}
                  onMouseEnter={() => setIndex(i())}
                  onClick={() => pick(command)}
                >
                  <span>{command.title}</span>
                  <Show when={command.keys}>{(keys) => <kbd>{chordLabel(keys())}</kbd>}</Show>
                </li>
              )}
            </For>
            <Show when={results().length === 0}>
              <li class="sp-palette-empty">No matching command.</li>
            </Show>
          </ul>
        </div>
      </div>
    </Show>
  );
}
