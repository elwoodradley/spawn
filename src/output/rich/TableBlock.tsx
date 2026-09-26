/**
 * A real table for a DataFrame page: sticky header with dtype and null
 * count (stats on hover), an index column, windowed rows so 100k rows cost
 * nothing, more rows fetched from the pool as you scroll, and client-side
 * sort over what is loaded.
 */
import { createMemo, createSignal, For, Show } from "solid-js";

import { pool } from "../../pool/client";
import type { Cell, DisplayPayload } from "../../pool/protocol";
import {
  describeColumn,
  formatCell,
  isNumericDtype,
  sortedOrder,
  visibleWindow,
  type SortDir,
} from "./table";

type Table = Extract<DisplayPayload, { kind: "table" }>;

const ROW_HEIGHT = 22;
const VIEWPORT = 280;
const PAGE = 200;

export default function TableBlock(props: { payload: Table }) {
  const [rows, setRows] = createSignal<Cell[][]>(props.payload.rows);
  const [index, setIndex] = createSignal<Cell[]>(props.payload.index);
  const [scrollTop, setScrollTop] = createSignal(0);
  const [sort, setSort] = createSignal<{ column: number; dir: SortDir } | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [exhausted, setExhausted] = createSignal(false);

  const total = () => props.payload.shape[0];
  const loaded = () => rows().length;

  const order = createMemo(() => {
    const s = sort();
    return s ? sortedOrder(rows(), s.column, s.dir) : rows().map((_, i) => i);
  });

  const win = createMemo(() => visibleWindow(scrollTop(), ROW_HEIGHT, VIEWPORT, loaded()));

  async function loadMore(): Promise<void> {
    if (loading() || exhausted() || loaded() >= total()) return;
    setLoading(true);
    try {
      const start = props.payload.rowStart + loaded();
      const more = await pool().tableRows(props.payload.ref, start, PAGE);
      if (more.length === 0) setExhausted(true);
      else {
        setRows((r) => [...r, ...more]);
        setIndex((i) => [...i, ...more.map((_, k) => start + k)]);
      }
    } catch {
      setExhausted(true);
    } finally {
      setLoading(false);
    }
  }

  const onScroll = (e: Event) => {
    const el = e.currentTarget as HTMLDivElement;
    setScrollTop(el.scrollTop);
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - ROW_HEIGHT * 20) void loadMore();
  };

  const toggleSort = (column: number) => {
    const s = sort();
    if (!s || s.column !== column) setSort({ column, dir: "asc" });
    else if (s.dir === "asc") setSort({ column, dir: "desc" });
    else setSort(null);
  };

  const slice = () => order().slice(win().start, win().end);

  return (
    <div class="sp-rich sp-rich--table">
      <div class="sp-rich__bar">
        <span class="sp-rich__badge mono">
          {props.payload.shape[0]} × {props.payload.shape[1]}
        </span>
        <span class="sp-rich__muted">{props.payload.source}</span>
        <span class="sp-rich__muted mono">
          {loaded() < total() ? `${loaded()} of ${total()} rows loaded` : `${total()} rows`}
        </span>
        <Show when={sort()}>
          {(s) => (
            <button class="sp-rich__linkbtn" onClick={() => setSort(null)}>
              sorted by {props.payload.columns[s().column]?.name} {s().dir === "asc" ? "↑" : "↓"} ·
              clear
            </button>
          )}
        </Show>
      </div>
      <div class="sp-rich__scroll" style={{ "max-height": `${VIEWPORT}px` }} onScroll={onScroll}>
        <table class="sp-table">
          <thead>
            <tr>
              <th class="sp-table__index" />
              <For each={props.payload.columns}>
                {(col, i) => (
                  <th
                    class="sp-table__th"
                    classList={{ "is-numeric": isNumericDtype(col.dtype) }}
                    title={describeColumn(col)}
                    onClick={() => toggleSort(i())}
                  >
                    <span class="sp-table__name">{col.name}</span>
                    <span class="sp-table__meta mono">
                      {col.dtype}
                      {col.nulls > 0 ? ` · ${col.nulls} ∅` : ""}
                    </span>
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <tr aria-hidden="true">
              <td
                colSpan={props.payload.columns.length + 1}
                style={{ height: `${win().topPad}px` }}
              />
            </tr>
            <For each={slice()}>
              {(rowIdx) => (
                <tr class="sp-table__row" style={{ height: `${ROW_HEIGHT}px` }}>
                  <td class="sp-table__index mono">{formatCell(index()[rowIdx] ?? rowIdx)}</td>
                  <For each={rows()[rowIdx] ?? []}>
                    {(cell, c) => (
                      <td
                        class="sp-table__td mono"
                        classList={{
                          "is-numeric": typeof cell === "number",
                          "is-null": cell === null,
                          "is-string": typeof cell === "string",
                        }}
                        title={c() < 0 ? "" : formatCell(cell)}
                      >
                        {formatCell(cell)}
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
            <tr aria-hidden="true">
              <td
                colSpan={props.payload.columns.length + 1}
                style={{ height: `${win().bottomPad}px` }}
              />
            </tr>
          </tbody>
        </table>
        <Show when={loading()}>
          <div class="sp-rich__muted sp-rich__loading">loading…</div>
        </Show>
      </div>
    </div>
  );
}
