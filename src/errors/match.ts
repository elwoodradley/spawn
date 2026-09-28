/**
 * `explain(croak, context)`: the pure entry point. Runs the library in order
 * and returns the first entry's explanation, pointed at the line in the
 * user's code the traceback names. `probe` is the optional second pass that
 * may look at the disk; the card calls it with the real filesystem, tests
 * with a fake.
 */
import { parseFrameLine, type Croak, type CroakFrame } from "../spawn/croak";
import { userFrame } from "./frames";
import {
  badIndex,
  divisionByZero,
  missingKey,
  missingModule,
  noneUsed,
  recursion,
  undefinedName,
} from "./library";
import { missingFile } from "./libraryFiles";
import { deviceMismatch, dtypeMismatch, outOfMemory, tensorConversion } from "./libraryMl";
import { badAttribute, eof, syntax } from "./librarySyntax";
import { badArity, badNumber, badTypes } from "./libraryValues";
import { shapeMismatch } from "./shapes";
import type { ErrorContext, Explanation, LibraryEntry, ProbeFs } from "./types";

/** Most specific first: the ML entries key on message text, the rest on type. */
export const LIBRARY: readonly LibraryEntry[] = [
  outOfMemory,
  shapeMismatch,
  deviceMismatch,
  tensorConversion,
  dtypeMismatch,
  missingModule,
  missingFile,
  undefinedName,
  missingKey,
  badIndex,
  noneUsed,
  divisionByZero,
  recursion,
  syntax,
  eof,
  badAttribute,
  badNumber,
  badTypes,
  badArity,
];

export interface Match {
  entry: LibraryEntry;
  details: unknown;
  explanation: Explanation;
}

/** Exception types come qualified from the console (`torch.cuda.OutOfMemoryError`). */
function bareType(type: string): string {
  return type.split(".").pop() ?? type;
}

function withWhere(explanation: Explanation, frames: readonly CroakFrame[]): Explanation {
  const frame = userFrame(frames);
  return frame ? { ...explanation, where: { file: frame.file, line: frame.line } } : explanation;
}

export function match(croak: Croak, context: ErrorContext): Match | null {
  const type = bareType(croak.type);
  for (const entry of LIBRARY) {
    const details: unknown = entry.matches(type, croak.message, croak.frames);
    if (details === null) continue;
    return {
      entry,
      details,
      explanation: withWhere(entry.describe(details, context), croak.frames),
    };
  }
  return null;
}

/** The explanation for a traceback, or null when the library has nothing to say. */
export function explain(croak: Croak, context: ErrorContext): Explanation | null {
  return match(croak, context)?.explanation ?? null;
}

/** The disk-aware second pass; null keeps the first explanation. */
export async function probe(
  found: Match,
  context: ErrorContext,
  fs: ProbeFs,
  croak: Croak,
): Promise<Explanation | null> {
  if (!found.entry.probe) return null;
  const refined = await found.entry.probe(found.details, context, fs);
  return refined ? withWhere(refined, croak.frames) : null;
}

/**
 * The Interactive Console sends type, message and the traceback text
 * separately; the frames come from the text, the rest is taken as given.
 */
export function croakFromPayload(payload: {
  type: string;
  message: string;
  traceback: string;
}): Croak {
  const frames: CroakFrame[] = [];
  for (const line of payload.traceback.split(/\r?\n/)) {
    const frame = parseFrameLine(line);
    if (frame) frames.push(frame);
  }
  return { frames, type: payload.type, message: payload.message.split(/\r?\n/)[0] ?? "" };
}
