import { describe, expect, it } from "vitest";

import { chooseInterpreter } from "./choose";

const sys = { path: "/usr/bin/python3", source: "system" as const, version: "3.9.6" };
const brew = { path: "/opt/homebrew/bin/python3.13", source: "homebrew" as const, version: "3.13" };
const venv = { path: "/p/.venv/bin/python", source: "broodVenv" as const };

describe("chooseInterpreter", () => {
  it("honours a saved choice, even the system Python, but still warns", () => {
    expect(chooseInterpreter([venv, sys], "/usr/bin/python3")).toMatchObject({
      path: "/usr/bin/python3",
    });
    expect(chooseInterpreter([venv, sys], "/usr/bin/python3").warning).toMatch(/system Python/);
    expect(chooseInterpreter([venv, sys], venv.path)).toEqual({ path: venv.path, warning: null });
  });

  it("skips the system Python when anything else exists", () => {
    expect(chooseInterpreter([sys, brew], null)).toEqual({ path: brew.path, warning: null });
  });

  it("uses the system Python only as a last resort, with a warning naming it", () => {
    const c = chooseInterpreter([sys], null);
    expect(c.path).toBe("/usr/bin/python3");
    expect(c.warning).toContain("/usr/bin/python3 (3.9.6)");
  });

  it("returns nothing when nothing was found", () => {
    expect(chooseInterpreter([], null)).toEqual({ path: null, warning: null });
  });
});
