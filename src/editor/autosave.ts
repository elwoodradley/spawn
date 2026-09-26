/**
 * Autosave scheduling, kept pure so it can be tested with a fake clock.
 *
 * `afterDelay`: each change restarts a per-document timer; when it fires
 * the document is saved. `onFocusChange`: the app saves everything dirty
 * when the window loses focus or the active tab changes.
 */

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export class AutosaveTimers {
  private readonly timers = new Map<string, unknown>();

  constructor(
    private readonly save: (path: string) => void,
    private readonly scheduler: Scheduler = globalThis,
  ) {}

  /** Restart the timer for `path`. */
  schedule(path: string, delayMs: number): void {
    this.cancel(path);
    const handle = this.scheduler.setTimeout(() => {
      this.timers.delete(path);
      this.save(path);
    }, delayMs);
    this.timers.set(path, handle);
  }

  cancel(path: string): void {
    const handle = this.timers.get(path);
    if (handle !== undefined) this.scheduler.clearTimeout(handle);
    this.timers.delete(path);
  }

  cancelAll(): void {
    for (const path of [...this.timers.keys()]) this.cancel(path);
  }

  pending(path: string): boolean {
    return this.timers.has(path);
  }
}

/** Remove trailing spaces and tabs from every line. */
export function trimTrailingWhitespace(text: string): string {
  return text.replace(/[ \t]+$/gm, "");
}

/** Make sure the text ends with exactly one newline (empty stays empty). */
export function ensureFinalNewline(text: string): string {
  if (text.length === 0) return text;
  return text.endsWith("\n") ? text : `${text}\n`;
}
