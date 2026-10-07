/// <reference types="node" />
/**
 * User-facing text uses standard terminology. This scans JSX text and string
 * literals in src/ for the retired words so a stray "Spawn" button label or
 * "brood" tooltip fails the build instead of reaching a student.
 *
 * Internal identifiers (command ids, module paths, CSS classes, store keys,
 * the app name SPAWN) are excluded on purpose; they are not user-facing.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const RETIRED = /\b(brood|clutch|pool|metamorphosis|croak(?:ed|s)?|spawn(?:ed|ing|s)?)\b/i;

/** Things that legitimately contain a retired word but are not shown to users. */
const ALLOWED = [
  /SPAWN/, // the app name
  /\bsp-/, // CSS classes
  /^["'`](?:brood|pool|spawn|croak|clutch|metamorphosis|tab|view|file|edit|help|lsp|output|env|settings|theme|palette|app)\.[a-zA-Z.]+["'`]$/, // command ids
  /^["'`](?:brood|pool|croak|clutch|spawn|stdout|stderr|stdin|system)["'`]$/, // enum-like values
  /spawn\.json|spawn:docx|stonetoad\/spawn|recent\.broods|interpreter:/, // keys, urls, events
  /\/(?:brood|pool|spawn)\//, // import paths
  /^["'`]\.\.?\/.*["'`]$/, // relative imports
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Comments are not shown to users; template expressions are code. */
function stripCode(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function offenders(rawSource: string): string[] {
  const source = stripCode(rawSource);
  const hits: string[] = [];
  // JSX text between a real tag close and the next tag (not an arrow `=>`),
  // string literals, and template literals with their expressions removed.
  const literal =
    /((?<![=-])>[^<{}\n]*<)|("(?:[^"\\\n]|\\.)*")|('(?:[^'\\\n]|\\.)*')|(`(?:[^`\\]|\\.)*`)/g;
  for (const m of source.matchAll(literal)) {
    const text = m[0].startsWith("`") ? m[0].replace(/\$\{[^}]*\}/g, "") : m[0];
    if (!RETIRED.test(text)) continue;
    if (ALLOWED.some((rule) => rule.test(text))) continue;
    // A literal that is only an identifier-like token is not prose.
    if (/^["'`][a-zA-Z0-9_.:/-]+["'`]$/.test(text)) continue;
    hits.push(text.trim().slice(0, 80));
  }
  for (const text of templateTexts(source)) {
    if (!RETIRED.test(text) || ALLOWED.some((rule) => rule.test(text))) continue;
    if (/^`[a-zA-Z0-9_.:/-]*`$/.test(text)) continue;
    hits.push(text.trim().slice(0, 80));
  }
  return [...new Set(hits)];
}

/**
 * The text parts of every template literal, nested ones included. The regex
 * above cannot pair the backticks of `a ${x ? `inner` : ""} b`, so the
 * inner text would never be looked at; this walks the source with a stack
 * of template and expression contexts instead.
 */
export function templateTexts(source: string): string[] {
  const out: string[] = [];
  const stack: Array<{ kind: "template"; text: string } | { kind: "expr"; depth: number }> = [];
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const top = stack[stack.length - 1];
    if (top?.kind === "template") {
      if (ch === "\\") {
        top.text += source.slice(i, i + 2);
        i++;
      } else if (ch === "`") {
        out.push(`\`${top.text}\``);
        stack.pop();
      } else if (ch === "$" && source[i + 1] === "{") {
        out.push(`\`${top.text}\``);
        top.text = "";
        stack.push({ kind: "expr", depth: 0 });
        i++;
      } else top.text += ch;
    } else if (ch === "`") {
      stack.push({ kind: "template", text: "" });
    } else if (ch === '"' || ch === "'") {
      // Skip a one-line string so a backtick or brace inside it does not count.
      const end = stringEnd(source, i);
      if (end !== -1) i = end;
    } else if (top?.kind === "expr") {
      if (ch === "{") top.depth++;
      else if (ch === "}" && top.depth-- === 0) stack.pop();
    }
  }
  return out;
}

/** Index of the quote closing the string opened at `start` on its line, or -1. */
function stringEnd(source: string, start: number): number {
  const quote = source[start];
  for (let i = start + 1; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") i++;
    else if (ch === quote) return i;
    else if (ch === "\n") return -1;
  }
  return -1;
}

describe("templateTexts", () => {
  it("finds the text of a template nested inside another's expression", () => {
    const source = 'const label = `Run ${busy ? `Spawn again (${n})` : ""} now`;';
    expect(templateTexts(source)).toEqual(["`Run `", "`Spawn again (`", "`)`", "` now`"]);
    expect(offenders(source)).toEqual(["`Spawn again (`"]);
  });
});

describe("user-facing terminology", () => {
  it("has no retired words in JSX text or string literals", () => {
    const problems: string[] = [];
    for (const file of walk(ROOT)) {
      const source = readFileSync(file, "utf8");
      for (const hit of offenders(source)) problems.push(`${file.replace(ROOT, "src")}: ${hit}`);
    }
    expect(problems).toEqual([]);
  });
});
