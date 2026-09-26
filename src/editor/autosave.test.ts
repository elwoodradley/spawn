import { describe, expect, it, vi } from "vitest";

import { AutosaveTimers, ensureFinalNewline, trimTrailingWhitespace } from "./autosave";

describe("AutosaveTimers", () => {
  it("saves once after the delay, restarting on each change", () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const timers = new AutosaveTimers(save);
    timers.schedule("a.py", 1000);
    vi.advanceTimersByTime(600);
    timers.schedule("a.py", 1000);
    vi.advanceTimersByTime(600);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(save).toHaveBeenCalledExactlyOnceWith("a.py");
    expect(timers.pending("a.py")).toBe(false);
    vi.useRealTimers();
  });

  it("cancels", () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const timers = new AutosaveTimers(save);
    timers.schedule("a.py", 100);
    timers.schedule("b.py", 100);
    timers.cancelAll();
    vi.advanceTimersByTime(200);
    expect(save).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("save transforms", () => {
  it("trims trailing whitespace per line", () => {
    expect(trimTrailingWhitespace("a  \nb\t\n  c ")).toBe("a\nb\n  c");
  });

  it("ensures a single final newline", () => {
    expect(ensureFinalNewline("a")).toBe("a\n");
    expect(ensureFinalNewline("a\n")).toBe("a\n");
    expect(ensureFinalNewline("")).toBe("");
  });
});
