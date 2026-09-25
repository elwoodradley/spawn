import { describe, expect, it } from "vitest";

import type { Entry } from "../ipc";
import {
  findNode,
  flatten,
  loadedDirectories,
  mergeChildren,
  nodeFromEntry,
  rootNode,
  visibleEntries,
} from "./tree";

const entry = (path: string, isDirectory = false): Entry => ({
  path,
  name: path.slice(path.lastIndexOf("/") + 1),
  isDirectory,
});

describe("visibleEntries", () => {
  it("hides noise folders", () => {
    const entries = [entry("/b/.git", true), entry("/b/src", true), entry("/b/main.py")];
    expect(visibleEntries(entries).map((e) => e.name)).toEqual(["src", "main.py"]);
  });
});

describe("flatten", () => {
  it("lists children of expanded directories with depth", () => {
    const root = rootNode("/b", "b");
    const src = { ...nodeFromEntry(entry("/b/src", true)), expanded: true };
    src.children = [nodeFromEntry(entry("/b/src/a.py"))];
    const closed = nodeFromEntry(entry("/b/tests", true));
    closed.children = [nodeFromEntry(entry("/b/tests/t.py"))];
    root.children = [src, closed, nodeFromEntry(entry("/b/main.py"))];

    expect(flatten(root).map((r) => [r.node.name, r.depth])).toEqual([
      ["src", 0],
      ["a.py", 1],
      ["tests", 0],
      ["main.py", 0],
    ]);
  });

  it("is empty without a root or before loading", () => {
    expect(flatten(null)).toEqual([]);
    expect(flatten(rootNode("/b", "b"))).toEqual([]);
  });
});

describe("mergeChildren", () => {
  it("keeps loaded state for directories that still exist", () => {
    const node = rootNode("/b", "b");
    const src = { ...nodeFromEntry(entry("/b/src", true)), expanded: true, children: [] };
    node.children = [src, nodeFromEntry(entry("/b/gone.py"))];

    const merged = mergeChildren(node, [entry("/b/src", true), entry("/b/new.py")]);
    expect(merged[0]).toBe(src);
    expect(merged.map((n) => n.name)).toEqual(["src", "new.py"]);
  });
});

describe("findNode and loadedDirectories", () => {
  it("walks the tree", () => {
    const root = rootNode("/b", "b");
    const src = nodeFromEntry(entry("/b/src", true));
    src.children = [nodeFromEntry(entry("/b/src/a.py"))];
    root.children = [src, nodeFromEntry(entry("/b/lib", true))];
    expect(findNode(root, "/b/src/a.py")?.name).toBe("a.py");
    expect(findNode(root, "/nope")).toBeNull();
    expect(loadedDirectories(root)).toEqual(["/b", "/b/src"]);
  });
});
