import { describe, expect, it } from "vitest";

import { OutputModel, stripAnsi } from "./output";

/** A model whose flush only runs when the test asks. */
function model(maxLines?: number) {
  const m = new OutputModel({ maxLines, schedule: () => {} });
  const flushed = () => {
    m.flush();
    return m.lines.map((l) => [l.stream, l.text] as const);
  };
  return { m, flushed };
}

describe("OutputModel lines", () => {
  it("splits chunks into lines and keeps a partial line open", () => {
    const { m, flushed } = model();
    m.append("stdout", "hello\nwor");
    m.append("stdout", "ld\n");
    expect(flushed()).toEqual([
      ["stdout", "hello"],
      ["stdout", "world"],
    ]);
  });

  it("does not flush until asked", () => {
    const { m } = model();
    m.append("stdout", "x\n");
    expect(m.lines).toHaveLength(0);
    m.flush();
    expect(m.lines).toHaveLength(1);
  });

  it("keeps stdout and stderr on separate lines when interleaved", () => {
    const { m, flushed } = model();
    m.append("stdout", "loading");
    m.append("stderr", "warn\n");
    m.append("stdout", " done\n");
    expect(flushed()).toEqual([
      ["stdout", "loading done"],
      ["stderr", "warn"],
    ]);
  });

  it("makes an empty line for a bare newline", () => {
    const { m, flushed } = model();
    m.append("stdout", "\n\n");
    expect(flushed()).toEqual([
      ["stdout", ""],
      ["stdout", ""],
    ]);
  });

  it("handles CRLF as one line break", () => {
    const { m, flushed } = model();
    m.append("stdout", "a\r\nb\r\n");
    expect(flushed()).toEqual([
      ["stdout", "a"],
      ["stdout", "b"],
    ]);
  });
});

describe("OutputModel rich", () => {
  it("closes open lines and adds a rich block in order", () => {
    const { m } = model();
    m.append("stdout", "before");
    m.appendRich({ kind: "text", text: "array([1, 2])" }, 3);
    m.append("stdout", "after\n");
    m.flush();
    expect(m.lines.map((l) => [l.stream, l.text, l.exec ?? null])).toEqual([
      ["stdout", "before", null],
      ["pool", "array([1, 2])", 3],
      ["stdout", "after", null],
    ]);
    expect(m.lines[1]?.rich?.kind).toBe("text");
  });

  it("summarises non-text payloads for copy and find", () => {
    const { m } = model();
    m.appendRich(
      {
        kind: "array",
        library: "numpy",
        shape: [3, 64, 64],
        dtype: "float64",
        device: null,
        requiresGrad: null,
        stats: null,
        preview: [],
        previewAxes: null,
      },
      1,
    );
    m.flush();
    expect(m.text()).toBe("[numpy array shape (3, 64, 64) float64]");
  });
});

describe("OutputModel stdin", () => {
  it("ends a pending prompt line so the reply does not glue onto it", () => {
    const { m, flushed } = model();
    m.append("stdout", "What is your name? ");
    m.append("stdin", "Toad\n");
    m.append("stdout", "Hello, Toad!\n");
    expect(flushed()).toEqual([
      ["stdout", "What is your name? "],
      ["stdin", "Toad"],
      ["stdout", "Hello, Toad!"],
    ]);
  });
});

describe("OutputModel carriage return", () => {
  it("rewrites the current line in place like tqdm", () => {
    const { m, flushed } = model();
    m.append("stderr", " 10%|#         | 1/10\r");
    m.append("stderr", " 20%|##        | 2/10\r");
    m.append("stderr", "100%|##########| 10/10\n");
    expect(flushed()).toEqual([["stderr", "100%|##########| 10/10"]]);
  });

  it("overwrites only the written columns, keeping a longer tail", () => {
    const { m, flushed } = model();
    m.append("stdout", "abcdef\rXY\n");
    expect(flushed()).toEqual([["stdout", "XYcdef"]]);
  });

  it("survives a CR split across chunks", () => {
    const { m, flushed } = model();
    m.append("stdout", "old text");
    m.append("stdout", "\r");
    m.append("stdout", "new text\n");
    expect(flushed()).toEqual([["stdout", "new text"]]);
  });
});

describe("OutputModel ansi", () => {
  it("strips colour and cursor escapes", () => {
    expect(stripAnsi("\x1b[31mred\x1b[0m \x1b[2K\x1b[1Gbar")).toBe("red bar");
    expect(stripAnsi("\x1b]0;title\x07text")).toBe("text");
  });

  it("strips escapes inside appended text", () => {
    const { m, flushed } = model();
    m.append("stdout", "\x1b[1;32mok\x1b[0m\n");
    expect(flushed()).toEqual([["stdout", "ok"]]);
  });
});

describe("OutputModel croaks", () => {
  const traceback =
    'Traceback (most recent call last):\n  File "/b/train.py", line 12, in <module>\n    main()\nValueError: bad shape\n';

  it("tags traceback lines as croak with links on frames", () => {
    const { m, flushed } = model();
    m.append("stderr", "warning first\n");
    m.append("stderr", traceback);
    m.append("stderr", "after\n");
    expect(flushed()).toEqual([
      ["stderr", "warning first"],
      ["croak", "Traceback (most recent call last):"],
      ["croak", '  File "/b/train.py", line 12, in <module>'],
      ["croak", "    main()"],
      ["croak", "ValueError: bad shape"],
      ["stderr", "after"],
    ]);
    expect(m.lines[2]?.link).toEqual({ file: "/b/train.py", line: 12 });
    expect(m.lines[4]?.link).toBeUndefined();
  });

  it("tags a traceback that arrives in many chunks", () => {
    const { m, flushed } = model();
    for (const ch of traceback) m.append("stderr", ch);
    expect(flushed().every(([s]) => s === "croak")).toBe(true);
  });

  it("tags the SyntaxError form", () => {
    const { m, flushed } = model();
    m.append(
      "stderr",
      '  File "/b/x.py", line 3\n    def f(:\n          ^\nSyntaxError: invalid syntax\n',
    );
    expect(flushed().map(([s]) => s)).toEqual(["croak", "croak", "croak", "croak"]);
  });

  it("never tags stdout as croak", () => {
    const { m, flushed } = model();
    m.append("stdout", traceback);
    expect(flushed().every(([s]) => s === "stdout")).toBe(true);
  });
});

describe("OutputModel housekeeping", () => {
  it("caps lines by dropping the oldest", () => {
    const { m, flushed } = model(3);
    m.append("stdout", "1\n2\n3\n4\n5\n");
    expect(flushed().map(([, t]) => t)).toEqual(["3", "4", "5"]);
    m.append("stdout", "6\n");
    expect(flushed().map(([, t]) => t)).toEqual(["4", "5", "6"]);
  });

  it("keeps writing to an open line after a trim", () => {
    const { m, flushed } = model(2);
    m.append("stdout", "1\n2\n3\npart");
    flushed();
    m.append("stdout", "ial\n");
    expect(flushed().map(([, t]) => t)).toEqual(["3", "partial"]);
  });

  it("clears everything including pending and open lines", () => {
    const { m, flushed } = model();
    m.append("stdout", "keep");
    flushed();
    m.append("stdout", "pending");
    m.clear();
    expect(m.lines).toHaveLength(0);
    m.append("stdout", "fresh\n");
    expect(flushed()).toEqual([["stdout", "fresh"]]);
  });

  it("starts the next run under its header, not on the last run's unfinished line", () => {
    const { m, flushed } = model();
    m.append("stdout", "Name: ");
    m.system("stopped after 2.0s");
    m.system("run b.py");
    m.append("stdout", "hello\n");
    expect(flushed()).toEqual([
      ["stdout", "Name: "],
      ["system", "stopped after 2.0s"],
      ["system", "run b.py"],
      ["stdout", "hello"],
    ]);
  });

  it("system notes get their own line", () => {
    const { m, flushed } = model();
    m.append("stdout", "no newline");
    m.system("exited");
    expect(flushed()).toEqual([
      ["stdout", "no newline"],
      ["system", "exited"],
    ]);
  });
});
