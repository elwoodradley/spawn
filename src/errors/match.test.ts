/**
 * Every everyday entry, fed the real text Python prints. The ML entries are
 * in matchMl.test.ts.
 */
import { describe, expect, it } from "vitest";

import { parseCroak } from "../spawn/croak";
import { croakFromPayload, explain, match, probe } from "./match";
import type { ErrorContext, ProbeFs } from "./types";

const CTX: ErrorContext = {
  source: "run",
  cwd: "/home/me/proj/src",
  projectRoot: "/home/me/proj",
  consoleVariables: [],
};

/** A traceback as a run prints it, ending in `Type: message`. */
function tb(last: string, file = "/home/me/proj/src/train.py", line = 12): string {
  return `Traceback (most recent call last):\n  File "${file}", line ${line}, in <module>\n    main()\n${last}\n`;
}

function run(last: string, context: ErrorContext = CTX, file?: string) {
  const croak = parseCroak(tb(last, file));
  if (!croak) throw new Error("test traceback did not parse");
  const ex = explain(croak, context);
  if (!ex) throw new Error(`no explanation for ${last}`);
  return ex;
}

describe("explain: everyday errors", () => {
  it("says nothing for an error it does not know", () => {
    const croak = parseCroak(tb("PermissionError: [Errno 13] Permission denied: '/etc/shadow'"));
    expect(croak && explain(croak, CTX)).toBeNull();
  });

  it("points at the innermost frame in the user's code, not the library", () => {
    const text = `Traceback (most recent call last):
  File "/home/me/proj/train.py", line 12, in <module>
    main()
  File "/home/me/proj/train.py", line 8, in main
    total / count
  File "/home/me/proj/.venv/lib/python3.12/site-packages/numpy/core/x.py", line 1, in f
    pass
ZeroDivisionError: division by zero
`;
    const croak = parseCroak(text);
    const ex = croak && explain(croak, CTX);
    expect(ex?.where).toEqual({ file: "/home/me/proj/train.py", line: 8 });
  });

  it("ModuleNotFoundError: names the package and offers to install it", () => {
    const ex = run("ModuleNotFoundError: No module named 'sklearn'");
    expect(ex.id).toBe("missing-module");
    expect(ex.title).toBe("sklearn isn't installed in this project's environment");
    expect(ex.body[0]).toContain("scikit-learn");
    expect(ex.actions).toEqual([
      { kind: "install", packageName: "scikit-learn", moduleName: "sklearn" },
    ]);
  });

  it("ModuleNotFoundError: a dotted module resolves to its top-level package", () => {
    const ex = run("ModuleNotFoundError: No module named 'cv2.aruco'");
    expect(ex.actions?.[0]).toMatchObject({ packageName: "opencv-python" });
    expect(run("ImportError: No module named yaml").actions?.[0]).toMatchObject({
      packageName: "pyyaml",
    });
  });

  it("ModuleNotFoundError: an unknown name may be the student's own file", () => {
    const ex = run("ModuleNotFoundError: No module named 'helper'");
    expect(ex.todo?.[0]).toContain("helper.py");
    expect(ex.actions?.[0]).toMatchObject({ packageName: "helper" });
  });

  it("ModuleNotFoundError: no install button for the student's own module elsewhere in the project", async () => {
    const croak = parseCroak(tb("ModuleNotFoundError: No module named 'solution'"));
    const m = croak && match(croak, CTX);
    if (!m || !croak) throw new Error("no match");
    const fs: ProbeFs = {
      exists: (p) => Promise.resolve(p === "/home/me/proj/solution.py"),
      join: (...parts) => parts.join("/"),
      dirName: (p) => p.slice(0, p.lastIndexOf("/")),
    };
    const ex = await probe(m, CTX, fs, croak);
    expect(ex?.title).toBe("solution is your own module, but Python cannot see it from this file");
    expect(ex?.actions).toBeUndefined();
    // A real package name is never second-guessed by the disk.
    const known = parseCroak(tb("ModuleNotFoundError: No module named 'numpy'"));
    const k = known && match(known, CTX);
    if (!k || !known) throw new Error("no match");
    expect(await probe(k, CTX, { ...fs, exists: () => Promise.resolve(true) }, known)).toBeNull();
    // Nothing on disk: the first card, with its button, stands.
    expect(await probe(m, CTX, { ...fs, exists: () => Promise.resolve(false) }, croak)).toBeNull();
  });

  it("ModuleNotFoundError: a stdlib module gets no install button", () => {
    const ex = run("ModuleNotFoundError: No module named '_tkinter'");
    expect(ex.actions).toBeUndefined();
    expect(ex.title).toContain("part of Python itself");
  });

  it("NameError: plain, with Python's own suggestion", () => {
    const ex = run("NameError: name 'pritn' is not defined. Did you mean: 'print'?");
    expect(ex.id).toBe("undefined-name");
    expect(ex.title).toBe("Nothing called pritn has been defined yet");
    expect(ex.todo?.[0]).toContain("'print'");
  });

  it("NameError: the name lives in the Interactive Console but not in the file", () => {
    const ctx = { ...CTX, consoleVariables: [{ name: "df", type: "DataFrame" }] };
    const ex = run("NameError: name 'df' is not defined", ctx);
    expect(ex.title).toBe("df exists in the Interactive Console but not in this file");
  });

  it("NameError: in the console, mentions running the defining cell first", () => {
    const ex = run("NameError: name 'model' is not defined", { ...CTX, source: "console" });
    expect(ex.todo?.some((t) => t.includes("earlier cells"))).toBe(true);
  });

  it("UnboundLocalError: a local read before assignment", () => {
    const ex = run(
      "UnboundLocalError: cannot access local variable 'count' where it is not associated with a value",
    );
    expect(ex.title).toContain("count is used inside a function before");
    expect(run("UnboundLocalError: local variable 'count' referenced before assignment").id).toBe(
      "undefined-name",
    );
  });

  it("KeyError through pandas is a missing column", () => {
    const text = `Traceback (most recent call last):
  File "/home/me/proj/eda.py", line 5, in <module>
    df["Age"]
  File "/home/me/proj/.venv/lib/python3.12/site-packages/pandas/core/frame.py", line 4102, in __getitem__
    indexer = self.columns.get_loc(key)
KeyError: 'Age'
`;
    const croak = parseCroak(text);
    const ex = croak && explain(croak, CTX);
    expect(ex?.title).toBe("There is no column named 'Age'");
    const withDf =
      croak && explain(croak, { ...CTX, consoleVariables: [{ name: "df", type: "DataFrame" }] });
    expect(withDf?.todo?.[0]).toContain("df.columns");
  });

  it("KeyError elsewhere is a missing dictionary key", () => {
    const ex = run("KeyError: 'age'");
    expect(ex.title).toBe("The dictionary has no key 'age'");
    expect(ex.todo?.[0]).toContain("d.get('age')");
  });

  it("IndexError: list, numpy and torch forms", () => {
    expect(run("IndexError: list index out of range").title).toBe(
      "The list has fewer items than the position you asked for",
    );
    const np = run("IndexError: index 5 is out of bounds for axis 0 with size 5");
    expect(np.facts).toEqual([
      { label: "Asked for", value: "position 5 on axis 0" },
      { label: "Available", value: "5 items, positions 0 to 4" },
    ]);
    expect(run("IndexError: index 3 is out of bounds for dimension 1 with size 3").id).toBe(
      "bad-index",
    );
  });

  it("TypeError / AttributeError on None explains where None comes from", () => {
    const ex = run("TypeError: 'NoneType' object is not subscriptable");
    expect(ex.id).toBe("none-used");
    expect(ex.body[0]).toContain("index it with [ ]");
    expect(ex.body[0]).toContain("list.sort()");
    expect(run("AttributeError: 'NoneType' object has no attribute 'shape'").body[0]).toContain(
      "use .shape on it",
    );
    expect(run("TypeError: 'NoneType' object is not iterable").body[0]).toContain("loop over it");
  });

  it("ZeroDivisionError and RecursionError", () => {
    expect(run("ZeroDivisionError: division by zero").title).toBe("Something was divided by zero");
    expect(run("ZeroDivisionError: float division by zero").id).toBe("division-by-zero");
    const rec = run(
      "RecursionError: maximum recursion depth exceeded while calling a Python object",
    );
    expect(rec.title).toBe("A function kept calling itself and never stopped");
  });

  it("EOFError from input()", () => {
    const ex = run("EOFError: EOF when reading a line");
    expect(ex.title).toBe("The program asked for input, but nothing was there");
  });

  it("AttributeError: object, module, and a suggestion", () => {
    const obj = run("AttributeError: 'list' object has no attribute 'shape'");
    expect(obj.title).toBe("A list has no .shape");
    const mod = run(
      "AttributeError: module 'numpy' has no attribute 'flaot'. Did you mean: 'float'?",
    );
    expect(mod.title).toBe("The module numpy has nothing called flaot");
    expect(mod.todo?.[0]).toContain(".float");
    expect(run("AttributeError: 'DataFrame' object has no attribute 'colums'").id).toBe(
      "bad-attribute",
    );
  });

  it("ValueError: text that is not a number", () => {
    const f = run("ValueError: could not convert string to float: 'abc'");
    expect(f.title).toBe("float() was given text that is not a number: 'abc'");
    const i = run("ValueError: invalid literal for int() with base 10: ''");
    expect(i.title).toBe("int() was given empty text");
  });

  it("TypeError: text mixed with numbers", () => {
    expect(run('TypeError: can only concatenate str (not "int") to str').id).toBe("bad-types");
    expect(run("TypeError: unsupported operand type(s) for +: 'int' and 'str'").id).toBe(
      "bad-types",
    );
    expect(run("TypeError: '<' not supported between instances of 'str' and 'int'").id).toBe(
      "bad-types",
    );
  });

  it("TypeError: wrong number of arguments, the forgotten self", () => {
    const ex = run("TypeError: Dog.speak() takes 1 positional argument but 2 were given");
    expect(ex.title).toBe("Dog.speak() was called with 2 arguments but takes 1");
    expect(ex.body[0]).toContain("def speak(self, ...)");
    const few = run("TypeError: area() missing 1 required positional argument: 'width'");
    expect(few.title).toBe("area() was called without 'width'");
  });
});

describe("explain: FileNotFoundError", () => {
  const MISSING = "FileNotFoundError: [Errno 2] No such file or directory: 'data/train.csv'";

  function fakeFs(existing: string[]): ProbeFs {
    return {
      exists: (p) => Promise.resolve(existing.includes(p)),
      join: (...parts) => parts.join("/"),
      dirName: (p) => p.slice(0, p.lastIndexOf("/")),
    };
  }

  function found() {
    const croak = parseCroak(tb(MISSING));
    const m = croak && match(croak, CTX);
    if (!m || !croak) throw new Error("no match");
    return { m, croak };
  }

  it("shows the path and the folder the program ran in", () => {
    const ex = run(MISSING);
    expect(ex.id).toBe("missing-file");
    expect(ex.title).toBe("Python could not find the file data/train.csv");
    expect(ex.facts).toEqual([
      { label: "File", value: "data/train.csv" },
      { label: "Looked in", value: "/home/me/proj/src" },
    ]);
  });

  it("offers to run from the project root when the file is there", async () => {
    const { m, croak } = found();
    const ex = await probe(m, CTX, fakeFs(["/home/me/proj/data/train.csv"]), croak);
    expect(ex?.body[1]).toContain("in the project root: data/train.csv");
    expect(ex?.actions).toEqual([
      { kind: "workingDirectory", mode: "project", file: "/home/me/proj/src/train.py" },
    ]);
    expect(ex?.where).toEqual({ file: "/home/me/proj/src/train.py", line: 12 });
  });

  it("offers the file's own folder when the file sits beside the script", async () => {
    const { m, croak } = found();
    const ctx = { ...CTX, cwd: "/home/me/proj" };
    const ex = await probe(m, ctx, fakeFs(["/home/me/proj/src/data/train.csv"]), croak);
    expect(ex?.actions).toEqual([
      { kind: "workingDirectory", mode: "file", file: "/home/me/proj/src/train.py" },
    ]);
  });

  it("says the file exists now when it is where the program looked", async () => {
    const { m, croak } = found();
    const ex = await probe(m, CTX, fakeFs(["/home/me/proj/src/data/train.csv"]), croak);
    expect(ex?.title).toBe("data/train.csv exists now");
  });

  it("says it looked everywhere when the file is nowhere", async () => {
    const { m, croak } = found();
    const ex = await probe(m, CTX, fakeFs([]), croak);
    expect(ex?.body[1]).toContain("Nothing named data/train.csv is in src or in the project root");
    expect(ex?.actions).toEqual([]);
  });

  it("shows a Windows path the way it was written, not as its repr", () => {
    const ex = run(
      "FileNotFoundError: [Errno 2] No such file or directory: 'C:\\\\Users\\\\sam\\\\data.csv'",
      CTX,
      "C:\\Users\\sam\\hw\\train.py",
    );
    expect(ex.facts?.[0]).toEqual({ label: "File", value: "C:\\Users\\sam\\data.csv" });
    expect(ex.where).toEqual({ file: "C:\\Users\\sam\\hw\\train.py", line: 12 });
  });

  it("leaves an absolute path alone", async () => {
    const croak = parseCroak(
      tb("FileNotFoundError: [Errno 2] No such file or directory: '/tmp/x.csv'"),
    );
    const m = croak && match(croak, CTX);
    if (!m || !croak) throw new Error("no match");
    expect(m.explanation.body[0]).toBe("Nothing exists at that exact path.");
    expect(await probe(m, CTX, fakeFs([]), croak)).toBeNull();
  });
});

describe("explain: syntax", () => {
  function syntax(last: string) {
    const croak = parseCroak(
      `  File "/home/me/proj/a.py", line 3\n    def f(:\n          ^\n${last}\n`,
    );
    if (!croak) throw new Error("did not parse");
    const ex = explain(croak, CTX);
    if (!ex) throw new Error("no explanation");
    return ex;
  }

  it("carries the line and reads each message shape", () => {
    expect(syntax("SyntaxError: invalid syntax").title).toBe(
      "Python could not read this line (line 3)",
    );
    expect(syntax("SyntaxError: invalid syntax. Perhaps you forgot a comma?").title).toContain(
      "comma is probably missing",
    );
    expect(syntax("SyntaxError: unterminated string literal (detected at line 3)").title).toContain(
      "missing its closing quote",
    );
    expect(syntax("SyntaxError: '(' was never closed").title).toContain("never closed");
    expect(syntax("SyntaxError: expected ':'").title).toContain("colon is missing");
    expect(
      syntax("IndentationError: expected an indented block after 'if' statement on line 2").body[0],
    ).toContain("'if' statement on line 2");
    expect(syntax("IndentationError: unexpected indent").title).toContain("indented more");
    expect(syntax("IndentationError: unindent does not match any outer indentation level").id).toBe(
      "syntax",
    );
    expect(syntax("TabError: inconsistent use of tabs and spaces in indentation").title).toContain(
      "tabs and spaces",
    );
    expect(syntax("SyntaxError: invalid character '“' (U+201C)").title).toContain(
      "pasted from a document",
    );
    expect(
      syntax("SyntaxError: Missing parentheses in call to 'print'. Did you mean print(...)?").title,
    ).toContain("print needs parentheses");
    expect(syntax("SyntaxError: invalid decimal literal").title).toContain(
      "number runs straight into",
    );
    expect(
      syntax(
        "SyntaxError: cannot assign to function call here. Maybe you meant '==' instead of '='?",
      ).title,
    ).toContain("single =");
  });
});

describe("croakFromPayload", () => {
  it("takes frames from the console traceback and the type as given", () => {
    const croak = croakFromPayload({
      type: "torch.cuda.OutOfMemoryError",
      message: "CUDA out of memory. Tried to allocate 2.00 GiB.",
      traceback:
        'Traceback (most recent call last):\n  File "/home/me/proj/train.py", line 30, in <module>\n    out = model(x)\nOutOfMemoryError: CUDA out of memory.\n',
    });
    expect(croak.frames).toEqual([{ file: "/home/me/proj/train.py", line: 30, name: "<module>" }]);
    expect(explain(croak, CTX)?.id).toBe("out-of-memory");
  });
});
