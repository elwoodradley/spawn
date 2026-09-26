/**
 * How the console is shown: find bar, wrap, timestamps. Session state, not
 * settings, because these are things you flip while looking at one run.
 */
import { createSignal } from "solid-js";

const [findOpen, setFindOpen] = createSignal(false);
const [findQuery, setFindQuery] = createSignal("");
const [filterOnly, setFilterOnly] = createSignal(false);
const [wrapLines, setWrapLines] = createSignal(true);
const [showTimestamps, setShowTimestamps] = createSignal(false);
/** Bumped by "next match" so the console scrolls to the following hit. */
const [findStep, setFindStep] = createSignal(0);

export {
  findOpen,
  setFindOpen,
  findQuery,
  setFindQuery,
  filterOnly,
  setFilterOnly,
  wrapLines,
  setWrapLines,
  showTimestamps,
  setShowTimestamps,
  findStep,
};

export function openFind(): void {
  setFindOpen(true);
}

export function closeFind(): void {
  setFindOpen(false);
  setFindQuery("");
  setFilterOnly(false);
}

export function nextMatch(): void {
  setFindStep((n) => n + 1);
}

export function lineMatches(text: string, query: string): boolean {
  return query.length > 0 && text.toLowerCase().includes(query.toLowerCase());
}

/** `HH:MM:SS.mmm` in local time for the timestamps gutter. */
export function formatStamp(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}
