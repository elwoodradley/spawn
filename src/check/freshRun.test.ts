import { describe, expect, it } from "vitest";

import { freshRunItem, innermostProjectFrame, lastTraceback, plainWords } from "./freshRun";
import type { RunResult } from "./process";

const ctx = { file: "/hw/main.py", root: "/hw", timeoutSeconds: 120 };
const result = (patch: Partial<RunResult>): RunResult => ({
  stdout: "",
  stderr: "",
  code: 0,
  timedOut: false,
  cancelled: false,
  startFailure: null,
  ...patch,
});

const NAME_ERROR = [
  "Traceback (most recent call last):",
  '  File "/hw/main.py", line 12, in <module>',
  "    main()",
  '  File "/hw/helpers.py", line 4, in main',
  "    print(df)",
  '  File "/usr/lib/python3.12/site.py", line 1, in x',
  "    pass",
  "NameError: name 'df' is not defined",
].join("\n");

describe("lastTraceback and innermostProjectFrame", () => {
  it("parses the final traceback and picks the deepest frame in the project", () => {
    const croak = lastTraceback(`warning: something\n${NAME_ERROR}\n`);
    expect(croak?.type).toBe("NameError");
    expect(innermostProjectFrame(croak!, "/hw", "/hw/main.py")).toEqual({
      file: "/hw/helpers.py",
      line: 4,
      name: "main",
    });
    expect(innermostProjectFrame(croak!, null, "/hw/main.py")?.line).toBe(12);
    expect(lastTraceback("no error here")).toBeNull();
  });
});

describe("freshRunItem", () => {
  it("is green on exit 0 with the output in the details", () => {
    const item = freshRunItem(result({ stdout: "hello\n" }), ctx);
    expect(item.state).toBe("pass");
    expect(item.detail).toBe("hello\n");
  });

  it("explains a traceback in plain words and links the innermost project frame", () => {
    const item = freshRunItem(result({ code: 1, stderr: NAME_ERROR }), ctx);
    expect(item.state).toBe("fail");
    expect(item.title).toBe("Stops with NameError: name 'df' is not defined");
    expect(item.hint).toContain("only existed in the Interactive Console");
    expect(item.hint).toContain("See line 4.");
    expect(item.link).toEqual({ file: "/hw/helpers.py", line: 4 });
    expect(plainWords("ZeroDivisionError")).toContain("zero");
    expect(plainWords("SomethingElse")).toBeNull();
  });

  it("treats EOFError from input() as a note, not a failure", () => {
    const stderr = [
      "Traceback (most recent call last):",
      '  File "/hw/main.py", line 2, in <module>',
      '    name = input("Name: ")',
      "EOFError: EOF when reading a line",
    ].join("\n");
    const item = freshRunItem(result({ code: 1, stderr, stdout: "Name: " }), ctx);
    expect(item.state).toBe("warn");
    expect(item.title).toBe(
      "This program asks for input. Run it yourself with F5 and answer the prompts.",
    );
  });

  it("reports timeouts, cancels, start failures and silent non-zero exits", () => {
    expect(freshRunItem(result({ code: null, timedOut: true }), ctx).title).toBe(
      "Still running after 2 minutes, stopped",
    );
    expect(freshRunItem(result({ code: null, cancelled: true }), ctx).state).toBe("skip");
    expect(freshRunItem(result({ code: null, startFailure: "not found" }), ctx).state).toBe("fail");
    const silent = freshRunItem(result({ code: 3, stderr: "boom" }), ctx);
    expect(silent.title).toBe("The program stopped with exit code 3");
    expect(freshRunItem(result({ code: null }), ctx).title).toBe(
      "The program was killed before it finished",
    );
  });
});
