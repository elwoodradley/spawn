/**
 * Where a traceback ends in the Output panel's lines, so the card sits under
 * the last one. A chained exception (`The above exception was the direct
 * cause…`, which pandas raises for every missing column) prints several
 * tracebacks in a row; only the final one gets a card, not one per link.
 */
import { isCroakChain, isCroakEnd } from "../spawn/croak";
import type { OutputLine } from "../spawn/output";

/** Blank lines Python puts between a traceback and the chain sentence. */
const CHAIN_LOOKAHEAD = 3;

/**
 * The text of the traceback that `index` closes, or null when that line does
 * not end a traceback or a chained one follows it.
 */
export function tracebackEndingAt(lines: readonly OutputLine[], index: number): string | null {
  const line = lines[index];
  if (!line || line.stream !== "croak" || !isCroakEnd(line.text)) return null;
  const next = lines[index + 1];
  if (next !== undefined && next.stream === "croak") return null;
  for (let i = index + 1; i <= index + CHAIN_LOOKAHEAD; i++) {
    const after = lines[i];
    if (!after || (after.stream !== "stderr" && after.stream !== "croak")) break;
    if (isCroakChain(after.text)) return null;
    if (after.text.trim() !== "") break;
  }
  let start = index;
  while (start > 0 && lines[start - 1]?.stream === "croak") start--;
  return lines
    .slice(start, index + 1)
    .map((l) => l.text)
    .join("\n");
}
