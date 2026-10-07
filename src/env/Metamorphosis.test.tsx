// @vitest-environment jsdom
import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";

vi.mock("../ipc", () => ({
  pathExists: () => Promise.resolve(false),
  getSetting: <T,>(_key: string, fallback: T) => Promise.resolve(fallback),
  setSetting: () => Promise.resolve(),
}));
vi.mock("./venv", () => ({
  createProjectVenv: () => Promise.resolve(),
  creatingVenv: () => false,
}));

const { default: Metamorphosis } = await import("./Metamorphosis");
const { metamorphosisOpen, setMetamorphosisOpen } = await import("./store");

describe("Select Python Interpreter popover", () => {
  it("closes on Escape even when focus is outside it", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => <Metamorphosis />, host);
    setMetamorphosisOpen(true);
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();

    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(metamorphosisOpen()).toBe(false);
    dispose();
  });
});
