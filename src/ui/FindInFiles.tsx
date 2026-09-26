/**
 * Mod-Shift-F: search every text file in the brood. A floating panel that
 * stays open while you jump between hits. The walk is cancellable and yields
 * between files so typing never stalls.
 */
import { createEffect, createSignal, For, on, Show } from "solid-js";
import { createStore } from "solid-js/store";

import { brood, openFile } from "../app/state";
import { broodFiles, relativeTo, type CancelToken } from "../brood/quickOpen";
import {
  buildMatcher,
  DEFAULT_SEARCH_OPTIONS,
  isProbablyBinary,
  previewOf,
  searchText,
  type SearchMatch,
  type SearchOptions,
} from "../brood/search";
import { readText } from "../ipc";
import Icon from "./Icon";
import "./FindInFiles.css";

const [isOpen, setOpen] = createSignal(false);

export function openFindInFiles(): void {
  setOpen(true);
}

export function closeFindInFiles(): void {
  setOpen(false);
}

interface FileHits {
  path: string;
  rel: string;
  matches: SearchMatch[];
}

export const RESULT_CAP = 2000;
const YIELD_EVERY = 25;

export default function FindInFiles() {
  const [query, setQuery] = createSignal("");
  const [opts, setOpts] = createStore<SearchOptions>({ ...DEFAULT_SEARCH_OPTIONS });
  const [results, setResults] = createStore<{ files: FileHits[] }>({ files: [] });
  const [status, setStatus] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  let input: HTMLInputElement | undefined;
  let token: CancelToken = { cancelled: false };
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const run = async () => {
    token.cancelled = true;
    token = { cancelled: false };
    const mine = token;
    setResults("files", []);
    setError(null);
    const root = brood();
    const matcher = buildMatcher(query(), { ...opts });
    if (!root || matcher === null) {
      setStatus(root ? "" : "Open a brood to search it.");
      return;
    }
    if ("error" in matcher) {
      setError(matcher.error);
      setStatus("");
      return;
    }
    setStatus("searching…");
    let total = 0;
    let scanned = 0;
    const files = await broodFiles(root, mine);
    for (const path of files) {
      if (mine.cancelled) return;
      if (total >= RESULT_CAP) break;
      scanned++;
      let text: string;
      try {
        text = await readText(path);
      } catch {
        continue;
      }
      if (isProbablyBinary(text)) continue;
      const matches = searchText(text, matcher.re, RESULT_CAP - total);
      if (matches.length > 0) {
        total += matches.length;
        setResults("files", (list) => [...list, { path, rel: relativeTo(root, path), matches }]);
      }
      if (scanned % YIELD_EVERY === 0) await new Promise((r) => setTimeout(r, 0));
    }
    if (mine.cancelled) return;
    const capped = total >= RESULT_CAP ? " (capped)" : "";
    setStatus(
      total === 0
        ? `No matches in ${scanned} files.`
        : `${total} matches in ${results.files.length} files${capped}`,
    );
  };

  const schedule = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => void run(), 180);
  };

  createEffect(
    on(isOpen, (open) => {
      if (open) queueMicrotask(() => input?.focus());
      else token.cancelled = true;
    }),
  );
  createEffect(
    on([query, () => opts.caseSensitive, () => opts.regex, () => opts.wholeWord], schedule, {
      defer: true,
    }),
  );

  const jump = (path: string, match: SearchMatch) => void openFile(path, match.line);

  return (
    <Show when={isOpen()}>
      <aside class="sp-fif" role="dialog" aria-label="Find in files">
        <div class="sp-fif__bar">
          <Icon name="search" />
          <input
            ref={(el) => (input = el)}
            class="sp-fif__input"
            type="text"
            placeholder="Find in files"
            spellcheck={false}
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                closeFindInFiles();
              } else if (e.key === "Enter") {
                e.preventDefault();
                void run();
              }
            }}
          />
          <Toggle
            label="Aa"
            title="Match case"
            on={opts.caseSensitive}
            onToggle={() => setOpts("caseSensitive", (v) => !v)}
          />
          <Toggle
            label="ab"
            title="Whole word"
            on={opts.wholeWord}
            onToggle={() => setOpts("wholeWord", (v) => !v)}
          />
          <Toggle
            label=".*"
            title="Regular expression"
            on={opts.regex}
            onToggle={() => setOpts("regex", (v) => !v)}
          />
          <button class="sp-fif__close" title="Close (Esc)" onClick={closeFindInFiles}>
            <Icon name="close" size={12} />
          </button>
        </div>
        <div class="sp-fif__status" classList={{ "is-error": error() !== null }}>
          {error() ?? status()}
        </div>
        <div class="sp-fif__results">
          <For each={results.files}>
            {(file) => (
              <div class="sp-fif__file">
                <div class="sp-fif__filename" title={file.path}>
                  {file.rel} <span class="sp-fif__count">{file.matches.length}</span>
                </div>
                <For each={file.matches}>
                  {(match) => {
                    const p = previewOf(match);
                    return (
                      <button class="sp-fif__match mono" onClick={() => jump(file.path, match)}>
                        <span class="sp-fif__line">{match.line}</span>
                        <span class="sp-fif__preview">
                          {p.before}
                          <mark class="sp-fif__hit">{p.hit}</mark>
                          {p.after}
                        </span>
                      </button>
                    );
                  }}
                </For>
              </div>
            )}
          </For>
        </div>
      </aside>
    </Show>
  );
}

function Toggle(props: { label: string; title: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      class="sp-fif__toggle mono"
      classList={{ "is-on": props.on }}
      title={props.title}
      aria-pressed={props.on}
      onClick={props.onToggle}
    >
      {props.label}
    </button>
  );
}
