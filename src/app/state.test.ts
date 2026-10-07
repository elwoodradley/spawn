import { describe, expect, it, vi } from "vitest";

const existing = new Set<string>(["/home/me/course"]);

vi.mock("../ipc", () => ({
  baseName: (p: string) => p.split("/").pop() ?? p,
  pathExists: (p: string) => Promise.resolve(existing.has(p)),
  getSetting: <T>(_key: string, fallback: T) => Promise.resolve(fallback),
  setSetting: () => Promise.resolve(),
}));

const { brood, lastCroak, openRecentBrood } = await import("./state");
const { addRecentBrood, recentBroods } = await import("./recent");

describe("opening a recent project", () => {
  it("opens one that still exists", async () => {
    await openRecentBrood("/home/me/course");
    expect(brood()).toBe("/home/me/course");
  });

  it("explains and forgets one that was moved or deleted", async () => {
    addRecentBrood("/home/me/gone");
    await openRecentBrood("/home/me/gone");
    expect(brood()).toBe("/home/me/course");
    expect(recentBroods()).not.toContain("/home/me/gone");
    expect(lastCroak()).toMatch(/no longer exists/);
  });
});
