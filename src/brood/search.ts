/**
 * Find in files: the pure parts. Building a matcher from the user's query
 * and options, scanning one file's text, and sniffing binaries.
 */

export interface SearchOptions {
  caseSensitive: boolean;
  regex: boolean;
  wholeWord: boolean;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  caseSensitive: false,
  regex: false,
  wholeWord: false,
};

export type Matcher = { re: RegExp } | { error: string } | null;

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `null` for an empty query; `{error}` for a regex that does not compile. */
export function buildMatcher(query: string, opts: SearchOptions): Matcher {
  if (query.length === 0) return null;
  let source = opts.regex ? query : escapeRegex(query);
  if (opts.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  try {
    return { re: new RegExp(source, `gu${opts.caseSensitive ? "" : "i"}`) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export interface SearchMatch {
  /** 1-based. */
  line: number;
  /** 0-based column of the match start. */
  col: number;
  /** The whole line, for a preview. */
  text: string;
  start: number;
  end: number;
}

/** Every match in `text`, line by line, up to `maxMatches`. */
export function searchText(text: string, re: RegExp, maxMatches = 200): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
    const line = lines[i] ?? "";
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      matches.push({
        line: i + 1,
        col: m.index,
        text: line,
        start: m.index,
        end: m.index + m[0].length,
      });
      if (m[0].length === 0) re.lastIndex++; // zero-width match: step forward
      if (matches.length >= maxMatches) break;
    }
  }
  return matches;
}

/** A NUL byte in the head of the file means it is not text. */
export function isProbablyBinary(text: string, sniff = 8192): boolean {
  return text.slice(0, sniff).includes("\u0000");
}

/** Trim a preview around the match so long lines stay readable. */
export function previewOf(
  match: SearchMatch,
  context = 40,
): { before: string; hit: string; after: string } {
  const from = Math.max(0, match.start - context);
  const to = Math.min(match.text.length, match.end + context);
  return {
    before: (from > 0 ? "…" : "") + match.text.slice(from, match.start),
    hit: match.text.slice(match.start, match.end),
    after: match.text.slice(match.end, to) + (to < match.text.length ? "…" : ""),
  };
}
