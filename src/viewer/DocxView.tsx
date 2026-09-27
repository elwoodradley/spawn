/**
 * A read-only tab for a Word document: the handout next to the code. Renders
 * the converted HTML in the app's type and colours, with a find box, a
 * warnings note for anything the converter could not carry over, and a
 * refresh for when the file changes on disk.
 */
import { createEffect, createResource, createSignal, on, onCleanup, Show } from "solid-js";

import { baseName, readBytes } from "../ipc";
import { docxToHtml, type DocxResult } from "./docx";
import "./DocxView.css";
import { clearMarks, focusMatch, markMatches } from "./find";

/** Dispatched on `window` by the Find command when a handout tab is active. */
export const DOCX_FIND_EVENT = "spawn:docx-find";

async function load(path: string): Promise<DocxResult> {
  const bytes = await readBytes(path);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return docxToHtml(buffer as ArrayBuffer);
}

export default function DocxView(props: { path: string }) {
  const [version, setVersion] = createSignal(0);
  const [doc] = createResource(
    () => [props.path, version()] as const,
    ([path]) => load(path),
  );
  const [query, setQuery] = createSignal("");
  const [matches, setMatches] = createSignal<HTMLElement[]>([]);
  const [current, setCurrent] = createSignal(-1);
  let body: HTMLElement | undefined;
  let input: HTMLInputElement | undefined;

  const runFind = (q: string) => {
    if (!body) return;
    const found = markMatches(body, q);
    setMatches(found);
    setCurrent(found.length ? focusMatch(found, 0) : -1);
  };

  createEffect(
    on([doc, query], ([d, q]) => {
      if (d && body) queueMicrotask(() => runFind(q));
    }),
  );

  const step = (delta: number) => setCurrent(focusMatch(matches(), current() + delta));

  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      input?.focus();
      input?.select();
    }
  };

  const focusFind = () => {
    input?.focus();
    input?.select();
  };
  window.addEventListener(DOCX_FIND_EVENT, focusFind);
  onCleanup(() => {
    window.removeEventListener(DOCX_FIND_EVENT, focusFind);
    if (body) clearMarks(body);
  });

  return (
    <section class="sp-docx" aria-label={`Document ${baseName(props.path)}`} onKeyDown={onKeyDown}>
      <header class="sp-docx__bar sp-no-print">
        <span class="sp-docx__name" title={props.path}>
          {baseName(props.path)}
        </span>
        <span class="sp-docx__hint">read-only</span>
        <span class="sp-docx__spacer" />
        <input
          ref={(el) => (input = el)}
          class="sp-docx__find"
          type="search"
          placeholder="Find in document"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") step(e.shiftKey ? -1 : 1);
            if (e.key === "Escape") setQuery("");
          }}
        />
        <Show when={query().trim().length >= 2}>
          <span class="sp-docx__count mono">
            {matches().length ? `${current() + 1}/${matches().length}` : "0"}
          </span>
          <button class="sp-docx__btn" title="Previous (Shift+Enter)" onClick={() => step(-1)}>
            ↑
          </button>
          <button class="sp-docx__btn" title="Next (Enter)" onClick={() => step(1)}>
            ↓
          </button>
        </Show>
        <button
          class="sp-docx__btn"
          title="Reload from disk"
          onClick={() => setVersion((v) => v + 1)}
        >
          ⟳
        </button>
      </header>
      <Show when={doc.error !== undefined}>
        <p class="sp-docx__croak">Could not read this document: {describe(doc.error)}</p>
      </Show>
      <Show when={doc.loading && !doc.latest}>
        <p class="sp-docx__hint sp-docx__loading">Opening…</p>
      </Show>
      <div class="sp-docx__scroll" tabIndex={0}>
        <Show when={doc.latest}>
          {(d) => (
            <>
              <Show when={d().warnings.length > 0}>
                <details class="sp-docx__warnings">
                  <summary>
                    {d().warnings.length} thing{d().warnings.length === 1 ? "" : "s"} the converter
                    could not carry over
                  </summary>
                  <ul>
                    {d().warnings.map((w) => (
                      <li>{w}</li>
                    ))}
                  </ul>
                </details>
              </Show>
              {/* Sanitized in docxToHtml; images are data URIs, links are http(s)/mailto only. */}
              <article class="sp-docx__body" ref={(el) => (body = el)} innerHTML={d().html} />
            </>
          )}
        </Show>
      </div>
    </section>
  );
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
