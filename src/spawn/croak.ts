/**
 * Croak parsing: turning Python's traceback text into something clickable.
 *
 * Two shapes matter:
 *
 *   Traceback (most recent call last):
 *     File "/brood/train.py", line 12, in <module>
 *       main()
 *   ValueError: shapes (3,4) and (5,6) not aligned
 *
 * and the SyntaxError report, which has no header:
 *
 *     File "/brood/train.py", line 3
 *       def f(:
 *              ^
 *   SyntaxError: invalid syntax
 *
 * Everything here is pure so the output model and tests can use it.
 */

export interface CroakFrame {
  file: string;
  /** 1-based. */
  line: number;
  /** The function name; absent in the SyntaxError form. */
  name?: string;
}

export interface Croak {
  frames: CroakFrame[];
  /** Exception class, e.g. `ValueError`. */
  type: string;
  message: string;
}

const HEADER = /^Traceback \(most recent call last\):\s*$/;
const FRAME = /^\s*File "(.+?)", line (\d+)(?:, in (.+?))?\s*$/;
/** A non-indented `ExceptionType: message` (or bare `ExceptionType`) line. */
const END = /^([A-Za-z_][\w.]*)(?::\s?(.*))?$/;
const CHAIN =
  /^(During handling of the above exception, another exception occurred|The above exception was the direct cause of the following exception):\s*$/;

export function parseFrameLine(line: string): CroakFrame | null {
  const match = FRAME.exec(line);
  if (!match) return null;
  const [, file, lineNo, name] = match;
  if (file === undefined || lineNo === undefined) return null;
  return name === undefined ? { file, line: Number(lineNo) } : { file, line: Number(lineNo), name };
}

/** Does this stderr line open a croak? */
export function isCroakStart(line: string): boolean {
  return HEADER.test(line) || (parseFrameLine(line) !== null && /^\s/.test(line));
}

/** Once inside a croak, is this line still part of it (but not the end)? */
export function isCroakContinuation(line: string): boolean {
  return line.trim() === "" || /^\s/.test(line) || HEADER.test(line) || CHAIN.test(line);
}

/** Is this the `ExceptionType: message` line that closes a croak? */
export function isCroakEnd(line: string): boolean {
  return END.test(line) && !HEADER.test(line) && !CHAIN.test(line);
}

/** Parse a whole traceback (possibly chained). Null if it is not one. */
export function parseCroak(text: string): Croak | null {
  const lines = text.split(/\r?\n/);
  const frames: CroakFrame[] = [];
  let sawHeader = false;
  let end: { type: string; message: string } | null = null;

  for (const line of lines) {
    if (HEADER.test(line)) {
      sawHeader = true;
      continue;
    }
    const frame = parseFrameLine(line);
    if (frame) {
      frames.push(frame);
      continue;
    }
    const endMatch = END.exec(line);
    if (endMatch && !CHAIN.test(line) && (sawHeader || frames.length > 0)) {
      end = { type: endMatch[1] ?? "", message: endMatch[2] ?? "" };
    }
  }

  if (!end || (!sawHeader && frames.length === 0)) return null;
  return { frames, type: end.type, message: end.message };
}

/** Frames that point at real files, innermost last, for "jump to error". */
export function fileFrames(croak: Croak): CroakFrame[] {
  return croak.frames.filter((f) => !f.file.startsWith("<"));
}
