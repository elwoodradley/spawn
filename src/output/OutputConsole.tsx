/**
 * The console half of the output area: the find bar, the scrolling line
 * list (following the bottom unless the user scrolls up), and the stdin row.
 * Mod-F with the console focused opens find here instead of in the editor.
 */
import { createEffect, createMemo, on, onCleanup, Show } from "solid-js";

import { output, spawnStatus } from "../spawn/controller";
import Icon from "../ui/Icon";
import OutputLines from "./OutputLines";
import StdinRow from "./StdinRow";
import {
  closeFind,
  filterOnly,
  findOpen,
  findQuery,
  findStep,
  lineMatches,
  nextMatch,
  openFind,
  setFilterOnly,
  setFindQuery,
  showTimestamps,
  wrapLines,
} from "./view";

export default function OutputConsole() {
  let scroller: HTMLDivElement | undefined;
  let findInput: HTMLInputElement | undefined;
  let following = true;
  let cursor = -1;

  const onScroll = () => {
    if (!scroller) return;
    following = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
  };

  // New lines: stick to the bottom if we were already there. Past the line
  // cap the length stays at the maximum (old lines go as new ones come), so
  // the dropped count is what changes then.
  createEffect(
    on(
      () => [output.lines.length, output.dropped()],
      () => {
        if (following && scroller) scroller.scrollTop = scroller.scrollHeight;
      },
    ),
  );

  // A fresh run always starts at the bottom.
  createEffect(
    on(spawnStatus, (status) => {
      if (status === "running") following = true;
    }),
  );

  createEffect(
    on(findOpen, (open) => {
      if (open) queueMicrotask(() => findInput?.focus());
    }),
  );

  const hits = createMemo(() => {
    const q = findQuery();
    return q ? output.lines.filter((l) => lineMatches(l.text, q)) : [];
  });

  // Enter in the find bar: scroll the next hit into view.
  createEffect(
    on(findStep, (step) => {
      if (step === 0 || hits().length === 0 || !scroller) return;
      cursor = (cursor + 1) % hits().length;
      const id = hits()[cursor]?.id;
      const el = id === undefined ? null : scroller.querySelector(`[data-line-id="${id}"]`);
      el?.scrollIntoView({ block: "center" });
      following = false;
    }),
  );
  createEffect(on(findQuery, () => (cursor = -1)));

  onCleanup(() => output.flush());

  const onKeyDown = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "f" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      openFind();
    } else if (e.key === "Escape" && findOpen()) {
      e.preventDefault();
      closeFind();
    }
  };

  return (
    <div class="sp-output__console" onKeyDown={onKeyDown}>
      <Show when={findOpen()}>
        <div class="sp-output__find" role="search">
          <Icon name="search" />
          <input
            ref={(el) => (findInput = el)}
            class="sp-output__find-input"
            type="text"
            placeholder="Find in output"
            spellcheck={false}
            value={findQuery()}
            onInput={(e) => setFindQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                nextMatch();
              }
            }}
          />
          <span class="sp-output__find-count">
            {findQuery() ? `${hits().length} ${hits().length === 1 ? "line" : "lines"}` : ""}
          </span>
          <label class="sp-output__find-toggle">
            <input
              type="checkbox"
              checked={filterOnly()}
              onChange={(e) => setFilterOnly(e.currentTarget.checked)}
            />
            only matches
          </label>
          <button class="sp-output__find-close" title="Close (Esc)" onClick={closeFind}>
            <Icon name="close" size={12} />
          </button>
        </div>
      </Show>
      <div
        class="sp-output__scroller"
        classList={{ "is-nowrap": !wrapLines() }}
        tabIndex={0}
        ref={(el) => (scroller = el)}
        onScroll={onScroll}
      >
        <OutputLines
          lines={output.lines}
          query={findQuery()}
          filterOnly={filterOnly()}
          timestamps={showTimestamps()}
        />
      </div>
      <StdinRow />
    </div>
  );
}
