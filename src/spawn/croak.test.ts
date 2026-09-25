import { describe, expect, it } from "vitest";

import {
  fileFrames,
  isCroakContinuation,
  isCroakEnd,
  isCroakStart,
  parseCroak,
  parseFrameLine,
} from "./croak";

const TRACEBACK = `Traceback (most recent call last):
  File "/brood/train.py", line 12, in <module>
    main()
  File "/brood/train.py", line 8, in main
    x = model(batch)
  File "/venv/lib/python3.12/site-packages/torch/nn/modules/module.py", line 1511, in _call_impl
    return forward_call(*args, **kwargs)
RuntimeError: mat1 and mat2 shapes cannot be multiplied (32x784 and 512x10)
`;

const SYNTAX = `  File "/brood/train.py", line 3
    def f(:
          ^
SyntaxError: invalid syntax
`;

const CHAINED = `Traceback (most recent call last):
  File "/brood/a.py", line 2, in <module>
    int("x")
ValueError: invalid literal for int() with base 10: 'x'

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "/brood/a.py", line 4, in <module>
    raise KeyError("wrapped")
KeyError: 'wrapped'
`;

describe("parseFrameLine", () => {
  it("reads file, line and function", () => {
    expect(parseFrameLine('  File "/brood/train.py", line 12, in <module>')).toEqual({
      file: "/brood/train.py",
      line: 12,
      name: "<module>",
    });
  });
  it("reads the SyntaxError form without a name", () => {
    expect(parseFrameLine('  File "/brood/train.py", line 3')).toEqual({
      file: "/brood/train.py",
      line: 3,
    });
  });
  it("ignores unrelated lines", () => {
    expect(parseFrameLine("loss: 0.234")).toBeNull();
    expect(parseFrameLine('print("File "x", line 1")')).toBeNull();
  });
});

describe("parseCroak", () => {
  it("parses a plain traceback", () => {
    const croak = parseCroak(TRACEBACK);
    expect(croak).not.toBeNull();
    expect(croak?.frames).toHaveLength(3);
    expect(croak?.frames[0]).toEqual({ file: "/brood/train.py", line: 12, name: "<module>" });
    expect(croak?.type).toBe("RuntimeError");
    expect(croak?.message).toContain("32x784");
  });

  it("parses the SyntaxError form", () => {
    const croak = parseCroak(SYNTAX);
    expect(croak?.frames).toEqual([{ file: "/brood/train.py", line: 3 }]);
    expect(croak?.type).toBe("SyntaxError");
    expect(croak?.message).toBe("invalid syntax");
  });

  it("collects every frame of a chained exception and the final type", () => {
    const croak = parseCroak(CHAINED);
    expect(croak?.frames.map((f) => f.line)).toEqual([2, 4]);
    expect(croak?.type).toBe("KeyError");
  });

  it("returns null for ordinary stderr", () => {
    expect(parseCroak("warning: deprecated\n")).toBeNull();
    expect(parseCroak("100%|██████████| 10/10 [00:01<00:00]")).toBeNull();
  });

  it("filters frames from <string> and friends", () => {
    const croak = parseCroak(
      'Traceback (most recent call last):\n  File "<string>", line 1, in <module>\n  File "/b/x.py", line 2, in f\nZeroDivisionError: division by zero\n',
    );
    expect(croak && fileFrames(croak)).toEqual([{ file: "/b/x.py", line: 2, name: "f" }]);
  });
});

describe("line classifiers", () => {
  it("recognise starts, continuations and ends", () => {
    expect(isCroakStart("Traceback (most recent call last):")).toBe(true);
    expect(isCroakStart('  File "/b/x.py", line 3')).toBe(true);
    expect(isCroakStart('File "/b/x.py", line 3')).toBe(false);
    expect(isCroakStart("loss: 0.1")).toBe(false);

    expect(isCroakContinuation("    main()")).toBe(true);
    expect(isCroakContinuation("")).toBe(true);
    expect(
      isCroakContinuation("During handling of the above exception, another exception occurred:"),
    ).toBe(true);
    expect(isCroakContinuation("KeyError: 'x'")).toBe(false);

    expect(isCroakEnd("KeyError: 'x'")).toBe(true);
    expect(isCroakEnd("KeyboardInterrupt")).toBe(true);
    expect(isCroakEnd("torch.cuda.OutOfMemoryError: CUDA out of memory")).toBe(true);
    expect(isCroakEnd("Traceback (most recent call last):")).toBe(false);
    expect(isCroakEnd('  File "x", line 1')).toBe(false);
  });
});
