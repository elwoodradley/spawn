/**
 * The output model: what the output panel shows.
 *
 * Child output arrives as arbitrary chunks. This model turns them into lines,
 * honouring `\r` the way a terminal does (tqdm rewrites its bar in place),
 * stripping ANSI escapes, tagging each line by stream, and marking stderr
 * lines that belong to a Python traceback as croaks with a clickable link.
 *
 * Appends are queued and applied by `flush()`, which the panel schedules once
 * per animation frame, so a loop printing thousands of lines a second costs
 * one render per frame. Lines live in a Solid store so the panel re-renders
 * only the rows that changed.
 */
import { createSignal, type Accessor } from "solid-js";
import { createStore, produce, type SetStoreFunction } from "solid-js/store";

import type { DisplayPayload } from "../pool/protocol";
import { isCroakContinuation, isCroakEnd, isCroakStart, parseFrameLine } from "./croak";

export type Stream = "stdout" | "stderr" | "stdin" | "croak" | "system" | "pool";

export interface OutputLink {
  file: string;
  line: number;
}

export interface OutputLine {
  id: number;
  stream: Stream;
  text: string;
  /** Wall-clock ms when the line was opened, for the timestamps gutter. */
  at: number;
  link?: OutputLink;
  /** A rich block from the pool (figure, table, array…). `text` is its summary. */
  rich?: DisplayPayload;
  /** Which pool exec produced a rich block. */
  exec?: number;
}

export interface OutputModelOptions {
  /** Oldest lines are dropped past this. */
  maxLines?: number;
  /** How to defer `flush`; the panel passes requestAnimationFrame. */
  schedule?: (flush: () => void) => void;
}

// CSI sequences (colours, cursor moves), OSC sequences (titles), lone ESC+char.
// eslint-disable-next-line no-control-regex -- matching ESC is the whole point
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

interface Pending {
  stream: Stream;
  text: string;
  rich?: DisplayPayload;
  exec?: number;
}

interface OpenLine {
  id: number;
  /** Write position within the line; `\r` resets it to 0. */
  col: number;
}

export const DEFAULT_MAX_LINES = 10_000;

export class OutputModel {
  /** Reactive: read inside Solid components, never mutate directly. */
  readonly lines: OutputLine[];
  private readonly setLines: SetStoreFunction<OutputLine[]>;
  private readonly maxLines: number;
  private readonly schedule: (flush: () => void) => void;
  private pending: Pending[] = [];
  private scheduled = false;
  private nextId = 1;
  /** One unterminated line per stream, so stdout and stderr never merge. */
  private open: Partial<Record<Stream, OpenLine>> = {};
  private inCroak = false;
  /** Lines discarded by the cap since the last clear. Reactive. */
  readonly dropped: Accessor<number>;
  private readonly setDropped: (n: number) => void;

  constructor(options: OutputModelOptions = {}) {
    const [lines, setLines] = createStore<OutputLine[]>([]);
    const [dropped, setDropped] = createSignal(0);
    this.dropped = dropped;
    this.setDropped = setDropped;
    this.lines = lines;
    this.setLines = setLines;
    this.maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
    this.schedule = options.schedule ?? ((flush) => flush());
  }

  /** Queue text for a stream. Applied on the next `flush`. */
  append(stream: Stream, text: string): void {
    if (text.length === 0) return;
    this.pending.push({ stream, text });
    if (!this.scheduled) {
      this.scheduled = true;
      this.schedule(() => this.flush());
    }
  }

  /** A one-line note from SPAWN itself, always on its own line. */
  system(text: string): void {
    this.append("system", `${text}\n`);
  }

  /**
   * A rich block from the pool. Queued like text so it lands in order with
   * the prints around it; it closes every open line first so it sits on a
   * row of its own.
   */
  appendRich(payload: DisplayPayload, exec: number): void {
    this.pending.push({ stream: "pool", text: richSummary(payload), rich: payload, exec });
    if (!this.scheduled) {
      this.scheduled = true;
      this.schedule(() => this.flush());
    }
  }

  clear(): void {
    this.pending = [];
    this.open = {};
    this.inCroak = false;
    this.setLines([]);
    this.setDropped(0);
  }

  /** Everything currently shown, one line per row, for copy and save. */
  text(): string {
    return this.lines.map((l) => l.text).join("\n");
  }

  /** Apply queued appends. Safe to call with nothing queued. */
  flush(): void {
    this.scheduled = false;
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    this.setLines(
      produce((lines) => {
        for (const item of batch) {
          if (item.rich) this.writeRich(lines, item);
          else this.write(lines, item.stream, stripAnsi(item.text));
        }
        this.trim(lines);
      }),
    );
  }

  private write(lines: OutputLine[], stream: Stream, text: string): void {
    // What the user typed answers whatever prompt is pending, so the prompt's
    // unterminated line ends here; the program's reply then starts fresh
    // instead of being glued onto the prompt.
    if (stream === "stdin") {
      if (this.open.stdout) this.closeLine(lines, "stdout");
      if (this.open.stderr) this.closeLine(lines, "stderr");
    }
    for (const token of text.split(/(\r\n|\n|\r)/)) {
      if (token === "") continue;
      if (token === "\n" || token === "\r\n") this.closeLine(lines, stream);
      else if (token === "\r") this.ensureOpen(lines, stream).col = 0;
      else this.overwrite(lines, stream, token);
    }
  }

  private writeRich(lines: OutputLine[], item: Pending): void {
    for (const stream of Object.keys(this.open) as Stream[]) this.closeLine(lines, stream);
    lines.push({
      id: this.nextId++,
      stream: "pool",
      text: item.text,
      at: Date.now(),
      rich: item.rich,
      exec: item.exec,
    });
  }

  private ensureOpen(lines: OutputLine[], stream: Stream): OpenLine {
    let open = this.open[stream];
    if (!open) {
      open = { id: this.nextId++, col: 0 };
      lines.push({ id: open.id, stream, text: "", at: Date.now() });
      this.open[stream] = open;
    }
    return open;
  }

  private overwrite(lines: OutputLine[], stream: Stream, segment: string): void {
    const open = this.ensureOpen(lines, stream);
    const line = lines[findIndex(lines, open.id)];
    if (!line) return;
    line.text =
      open.col >= line.text.length
        ? line.text + segment
        : line.text.slice(0, open.col) + segment + line.text.slice(open.col + segment.length);
    open.col += segment.length;
  }

  private closeLine(lines: OutputLine[], stream: Stream): void {
    const open = this.ensureOpen(lines, stream);
    delete this.open[stream];
    if (stream !== "stderr") return;
    const line = lines[findIndex(lines, open.id)];
    if (!line) return;
    if (this.classify(line.text) === "croak") {
      line.stream = "croak";
      const frame = parseFrameLine(line.text);
      if (frame && !frame.file.startsWith("<")) line.link = { file: frame.file, line: frame.line };
    }
  }

  /** Track whether we are inside a traceback across stderr lines. */
  private classify(text: string): Stream {
    if (this.inCroak) {
      if (isCroakEnd(text)) {
        this.inCroak = false;
        return "croak";
      }
      if (isCroakContinuation(text)) return "croak";
      this.inCroak = false;
      return "stderr";
    }
    if (isCroakStart(text)) {
      this.inCroak = true;
      return "croak";
    }
    return "stderr";
  }

  private trim(lines: OutputLine[]): void {
    const excess = lines.length - this.maxLines;
    if (excess > 0) {
      lines.splice(0, excess);
      this.setDropped(this.dropped() + excess);
    }
  }
}

/** Open lines are always near the end, so search backwards. */
function findIndex(lines: OutputLine[], id: number): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]?.id === id) return i;
  }
  return -1;
}

/** One line of text standing in for a rich block in copy, save and find. */
export function richSummary(payload: DisplayPayload): string {
  switch (payload.kind) {
    case "text":
      return payload.text;
    case "figure":
      return `[figure ${payload.width}×${payload.height}${payload.title ? ` ${payload.title}` : ""}]`;
    case "table":
      return `[table ${payload.shape[0]}×${payload.shape[1]} ${payload.columns.map((c) => c.name).join(", ")}]`;
    case "array":
      return `[${payload.library} array shape (${payload.shape.join(", ")}) ${payload.dtype}]`;
    case "matrix":
      return `[confusion matrix ${payload.values.length}×${payload.values.length}]`;
    case "images":
      return `[${payload.count} images (${payload.shape.join(", ")}) ${payload.dtype}]`;
    case "html":
      return "[html]";
    case "error":
      return `${payload.type}: ${payload.message}`;
  }
}
