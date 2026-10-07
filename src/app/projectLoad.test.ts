import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";

const project = vi.hoisted(() => ({ open: (_root: string | null) => {} }));
/** Reads of project A's file wait for this, so B's load finishes first. */
let releaseA = () => {};
const slowA = new Promise<void>((resolve) => (releaseA = resolve));

vi.mock("../ipc", () => ({
  baseName: (p: string) => p.split("/").pop() ?? p,
  dirName: (p: string) => p.slice(0, p.lastIndexOf("/")),
  joinPath: (...parts: string[]) => parts.join("/"),
  makeDir: vi.fn(),
  writeText: vi.fn(),
  getSetting: vi.fn((_key: string, fallback: unknown) => Promise.resolve(fallback)),
  setSetting: vi.fn(() => Promise.resolve()),
  pathExists: (p: string) => Promise.resolve(p.startsWith("/a/")),
  readText: async () => {
    await slowA;
    return JSON.stringify({ workingDirectory: "project" });
  },
}));
vi.mock("./state", () => {
  const [brood, setBrood] = createSignal<string | null>(null);
  project.open = setBrood;
  return { brood };
});

const { loadProjectSettings, projectSettings } = await import("./project");

describe("loadProjectSettings", () => {
  it("keeps the settings of the project that is open now, not a slower earlier one", async () => {
    project.open("/a");
    const a = loadProjectSettings("/a");
    project.open("/b");
    await loadProjectSettings("/b");
    releaseA();
    await a;
    expect(projectSettings()).toEqual({});
  });
});
