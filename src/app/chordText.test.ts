/// <reference types="node" />
/**
 * "Mod" is a chord-syntax word, not a key anyone has. JSX text must show
 * shortcuts through chordLabel (Ctrl+N, ⌘N), never the raw chord.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

describe("shortcut text in the UI", () => {
  it("never shows a raw Mod- chord in JSX text", () => {
    const hits: string[] = [];
    for (const file of walk(ROOT)) {
      const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of source.matchAll(/(?<![=-])>[^<{}]*\bMod-[^<{}]*</g)) {
        hits.push(`${file.replace(ROOT, "src")}: ${m[0].trim()}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
