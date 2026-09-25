/** Ranking for the command palette. Pure, so it is tested without a DOM. */
import type { Command } from "../app/commands";

/**
 * Score a query against text. Substring hits rank by position; otherwise
 * every query character must appear in order and gaps cost points. `null`
 * means no match. Lower is better.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (q.length === 0) return 0;
  const direct = t.indexOf(q);
  if (direct !== -1) return direct;
  let score = 0;
  let from = 0;
  for (const ch of q) {
    const idx = t.indexOf(ch, from);
    if (idx === -1) return null;
    score += idx - from + 1;
    from = idx + 1;
  }
  return score + 100;
}

export function rankCommands(commands: readonly Command[], query: string): Command[] {
  return commands
    .map((command) => ({ command, score: fuzzyScore(query, command.title) }))
    .filter((r): r is { command: Command; score: number } => r.score !== null)
    .sort((a, b) => a.score - b.score || a.command.title.localeCompare(b.command.title))
    .map((r) => r.command);
}
