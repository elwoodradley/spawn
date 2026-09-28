import { describe, expect, it } from "vitest";

import { classifyPath, isAbsolutePath, pathsItem, scanPaths } from "./paths";
import { looksLikePath, tokenize } from "./pathScan";

const src = (...lines: string[]) => lines.join("\n") + "\n";

describe("tokenize", () => {
  it("finds literals with their lines and blanks their insides", () => {
    const { literals, masked } = tokenize(src('x = "a(b"  # "not"', "y = 'c'"));
    expect(literals.map((l) => [l.value, l.line, l.skip])).toEqual([
      ["a(b", 1, false],
      ["c", 2, false],
    ]);
    expect(masked.split("\n")[0]).toBe('x = "   "  # "not"');
  });

  it("skips f-strings, bytes and docstrings but keeps raw strings", () => {
    const { literals } = tokenize(
      src('"""doc data/x.csv"""', 'a = f"{d}/x.csv"', "b = b'x.bin'", 'c = r"data\\\\x.csv"'),
    );
    expect(literals.map((l) => l.skip)).toEqual([true, true, true, false]);
    expect(literals[3]?.value).toBe("data\\\\x.csv");
  });
});

describe("looksLikePath", () => {
  it("accepts data files and anchored paths, rejects prose, tags and formats", () => {
    for (const yes of ["data.csv", "model.pt", "./data", "../in/", "data/", "C:\\x", "/tmp/a"]) {
      expect(looksLikePath(yes), yes).toBe(true);
    }
    for (const no of [
      "epoch 3/10",
      "3/10",
      "/",
      ".csv",
      "train/loss",
      "http://x/y.csv",
      "%d/%m",
      "*.csv",
      "w",
    ]) {
      expect(looksLikePath(no), no).toBe(false);
    }
  });
});

describe("scanPaths", () => {
  it("finds the readers from the brief and marks writes", () => {
    const refs = scanPaths(
      src(
        'df = pd.read_csv("data/train.csv", sep=";")',
        'arr = np.load("weights.npy")',
        'torch.save(model, "out/model.pt")',
        'img = Image.open("cat.png")',
        'cfg = json.load(open("config.json"))',
        'with open("results.txt", "w") as f:',
        '    f.write("hello")',
        'np.savetxt("scores.txt", scores)',
        'p = Path("data")',
      ),
    );
    expect(refs).toEqual([
      { path: "data/train.csv", line: 1, use: "read", via: "pd.read_csv" },
      { path: "weights.npy", line: 2, use: "read", via: "np.load" },
      { path: "out/model.pt", line: 3, use: "write", via: "torch.save" },
      { path: "cat.png", line: 4, use: "read", via: "Image.open" },
      { path: "config.json", line: 5, use: "read", via: "open" },
      { path: "results.txt", line: 6, use: "write", via: "open" },
      { path: "scores.txt", line: 8, use: "write", via: "np.savetxt" },
      { path: "data", line: 9, use: "read", via: "Path" },
    ]);
  });

  it("reads open modes, keyword args and Path methods", () => {
    const refs = scanPaths(
      src(
        'open("a.txt", mode="a")',
        'open(file="b.txt")',
        'open("c.txt", "rb")',
        'Path("out").mkdir(exist_ok=True)',
        'Path("d.txt").write_text("x")',
        'Path("e.txt").open("w")',
      ),
    );
    expect(refs.map((r) => [r.path, r.use])).toEqual([
      ["a.txt", "write"],
      ["b.txt", "read"],
      ["c.txt", "read"],
      ["out", "write"],
      ["d.txt", "write"],
      ["e.txt", "write"],
    ]);
  });

  it("combines literal join arguments and skips anchored ones", () => {
    const refs = scanPaths(
      src(
        'os.path.join("data", "raw", "x.csv")',
        'os.path.join(BASE, "y.csv")',
        'Path(__file__).parent / "z.csv"',
        'ROOT / "w.csv"',
        '", ".join(names)',
      ),
    );
    expect(refs).toEqual([{ path: "data/raw/x.csv", line: 1, use: "read", via: "os.path.join" }]);
  });

  it("treats bare path-looking literals as unknown use and ignores non-path calls", () => {
    const refs = scanPaths(
      src(
        'MODEL = "model.pt"',
        'print("saved to out.csv")',
        'writer.add_scalar("train/loss", 0.1)',
        'if name.endswith(".csv"):',
        'files = ["a.csv", "b.csv"]',
        'spacy.load("en_core_web_sm")',
        'url = "https://example.com/data.csv"',
        'x = "data\\\\raw\\\\in.csv"',
      ),
    );
    expect(refs).toEqual([
      { path: "model.pt", line: 1, use: "unknown", via: null },
      { path: "a.csv", line: 5, use: "unknown", via: null },
      { path: "b.csv", line: 5, use: "unknown", via: null },
      { path: "data/raw/in.csv", line: 8, use: "unknown", via: null },
    ]);
  });

  it("copes with multi-line calls and deduplicates", () => {
    const refs = scanPaths(
      src(
        "df = pd.read_csv(",
        '    "data.csv",',
        "    index_col=0,",
        ")",
        'pd.read_csv("data.csv")',
      ),
    );
    expect(refs).toEqual([{ path: "data.csv", line: 2, use: "read", via: "pd.read_csv" }]);
  });
});

describe("classifyPath", () => {
  const ctx = { file: "/hw/src/main.py", cwdLabel: "src/", otherLabel: "hw/" };
  const ref = (path: string, use: "read" | "write" | "unknown" = "read") => ({
    path,
    line: 3,
    use,
    via: "open",
  });

  it("flags absolute paths whatever else is true", () => {
    expect(isAbsolutePath("/home/me/x.csv")).toBe(true);
    expect(isAbsolutePath("C:/Users/x.csv")).toBe(true);
    expect(isAbsolutePath("~/x.csv")).toBe(true);
    expect(isAbsolutePath("data/x.csv")).toBe(false);
    const row = classifyPath(
      ref("/home/me/x.csv", "write"),
      { fromCwd: true, fromOther: true },
      ctx,
    );
    expect(row.state).toBe("warn");
    expect(row.text).toContain("only works on this machine");
    expect(row.link).toEqual({ file: "/hw/src/main.py", line: 3 });
  });

  it("passes writes and files found from the working directory", () => {
    expect(
      classifyPath(ref("out.csv", "write"), { fromCwd: false, fromOther: false }, ctx).state,
    ).toBe("pass");
    const row = classifyPath(ref("x.csv"), { fromCwd: true, fromOther: false }, ctx);
    expect(row.state).toBe("pass");
    expect(row.text).toBe("x.csv in open(…): found from src/");
  });

  it("fails a file that only resolves from the other folder, naming it", () => {
    const row = classifyPath(ref("data/x.csv"), { fromCwd: false, fromOther: true }, ctx);
    expect(row.state).toBe("fail");
    expect(row.text).toContain("not found from src/");
    expect(row.text).toContain("exists from hw/");
  });

  it("fails a missing read and only warns about a missing unknown", () => {
    expect(classifyPath(ref("nope.csv"), { fromCwd: false, fromOther: false }, ctx).text).toContain(
      "file not found",
    );
    const unknown = classifyPath(
      ref("nope.csv", "unknown"),
      { fromCwd: false, fromOther: null },
      {
        ...ctx,
        otherLabel: null,
      },
    );
    expect(unknown.state).toBe("warn");
  });
});

describe("pathsItem", () => {
  it("summarises rows by their worst state", () => {
    expect(pathsItem([]).state).toBe("skip");
    const pass = { state: "pass" as const, text: "a" };
    const fail = { state: "fail" as const, text: "b" };
    const warn = { state: "warn" as const, text: "c" };
    expect(pathsItem([pass, pass]).title).toBe("2 file paths checked, all found");
    expect(pathsItem([pass, warn]).title).toBe("2 file paths checked, 1 to look at");
    const item = pathsItem([pass, fail, warn]);
    expect(item.state).toBe("fail");
    expect(item.title).toBe("1 file path of 3 will not be found when the program runs");
    expect(item.rows).toHaveLength(3);
  });
});
