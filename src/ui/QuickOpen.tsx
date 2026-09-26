/** Mod-P: any file in the brood, a few keystrokes away. Same look as the palette. */
import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js";

import { recentFiles } from "../app/recent";
import { brood, openFile } from "../app/state";
import { broodFiles, invalidateFileCache, rankFiles, type CancelToken } from "../brood/quickOpen";
import Icon from "./Icon";
import "./CommandPalette.css";
import "./QuickOpen.css";

const [isOpen, setOpen] = createSignal(false);

export function openQuickOpen(): void {
  setOpen(true);
}

export function closeQuickOpen(): void {
  setOpen(false);
}

export default function QuickOpen() {
  const [query, setQuery] = createSignal("");
  const [index, setIndex] = createSignal(0);
  const [files, setFiles] = createSignal<readonly string[]>([]);
  const [loading, setLoading] = createSignal(false);
  let input: HTMLInputElement | undefined;
  let token: CancelToken = { cancelled: false };

  const results = createMemo(() => {
    const root = brood();
    return root ? rankFiles(files(), root, query(), recentFiles()) : [];
  });

  createEffect(
    on(isOpen, (open) => {
      token.cancelled = true;
      if (!open) return;
      setQuery("");
      setIndex(0);
      queueMicrotask(() => input?.focus());
      const root = brood();
      if (!root) return;
      token = { cancelled: false };
      const mine = token;
      setLoading(true);
      void broodFiles(root, mine)
        .then((list) => {
          if (!mine.cancelled) setFiles(list);
        })
        .finally(() => {
          if (!mine.cancelled) setLoading(false);
        });
    }),
  );

  // A different brood means a different file list.
  createEffect(on(brood, () => invalidateFileCache(), { defer: true }));

  const pick = (path: string | undefined) => {
    if (!path) return;
    closeQuickOpen();
    void openFile(path);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const count = results().length;
    if (e.key === "Escape") closeQuickOpen();
    else if (e.key === "ArrowDown") setIndex((i) => (count ? (i + 1) % count : 0));
    else if (e.key === "ArrowUp") setIndex((i) => (count ? (i - 1 + count) % count : 0));
    else if (e.key === "Enter") pick(results()[index()]?.path);
    else return;
    e.preventDefault();
  };

  return (
    <Show when={isOpen()}>
      <div class="sp-palette-backdrop" onClick={closeQuickOpen}>
        <div
          class="sp-palette sp-quickopen"
          role="dialog"
          aria-label="Go to file"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="sp-palette-input">
            <Icon name="file" />
            <input
              ref={(el) => (input = el)}
              type="text"
              placeholder={brood() ? "Go to file in the brood" : "Open a brood first"}
              spellcheck={false}
              value={query()}
              onInput={(e) => {
                setQuery(e.currentTarget.value);
                setIndex(0);
              }}
              onKeyDown={onKeyDown}
            />
            <Show when={loading()}>
              <span class="sp-quickopen-status">scanning…</span>
            </Show>
          </div>
          <ul class="sp-palette-list" role="listbox">
            <For each={results()}>
              {(item, i) => (
                <li
                  class="sp-palette-item sp-quickopen-item"
                  classList={{ "is-selected": i() === index() }}
                  role="option"
                  aria-selected={i() === index()}
                  onMouseEnter={() => setIndex(i())}
                  onClick={() => pick(item.path)}
                >
                  <span class="sp-quickopen-name">{item.rel.split("/").pop()}</span>
                  <span class="sp-quickopen-path">{item.rel}</span>
                </li>
              )}
            </For>
            <Show when={!loading() && results().length === 0}>
              <li class="sp-palette-empty">
                {brood() ? "No matching file." : "Open a brood to search its files."}
              </li>
            </Show>
          </ul>
        </div>
      </div>
    </Show>
  );
}
