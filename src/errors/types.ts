/**
 * The shapes shared by the error library, the matcher and the card.
 *
 * An entry is pure: it looks at the exception type, message and frames and
 * produces an `Explanation` in plain words. Anything that needs the machine
 * (does the file exist, which interpreter is selected) is an `ActionSpec`
 * or a `probe`, which `fixes.ts` resolves outside the library.
 */
import type { CroakFrame } from "../spawn/croak";

/** What the matcher knows about the run besides the traceback. */
export interface ErrorContext {
  /** Whether the error came from an F5 run or from the Interactive Console. */
  source: "run" | "console";
  /** Where the program ran, when known. */
  cwd: string | null;
  projectRoot: string | null;
  /** What the Interactive Console holds right now (name and type). */
  consoleVariables: readonly { name: string; type: string }[];
}

/** A fact shown as `label: value`, e.g. the two shapes side by side. */
export interface Fact {
  label: string;
  value: string;
}

/** Something the card can do. `fixes.ts` turns these into buttons. */
export type ActionSpec =
  | { kind: "install"; packageName: string; moduleName: string }
  | { kind: "workingDirectory"; mode: "file" | "project"; file: string | null };

/** A frame in the user's own code (not a library, not `<stdin>`). */
export interface Where {
  file: string;
  line: number;
}

export interface Explanation {
  /** The library entry that produced it. */
  id: string;
  /** One line, plain words, no exception jargon. */
  title: string;
  /** Short paragraphs. */
  body: string[];
  facts?: Fact[];
  /** "What to do" bullets. */
  todo?: string[];
  actions?: ActionSpec[];
  /** The line in the user's code the traceback points at. */
  where?: Where;
}

/** The filesystem questions a probe may ask; tests pass a fake. */
export interface ProbeFs {
  exists(path: string): Promise<boolean>;
  join(...parts: string[]): string;
  dirName(path: string): string;
}

export interface LibraryEntry<Details = unknown> {
  id: string;
  /** Details pulled from the message with regexes, or null when it is not this error. */
  matches(type: string, message: string, frames: readonly CroakFrame[]): Details | null;
  /** Pure: the card as it can be shown right away. */
  describe(details: Details, context: ErrorContext): Explanation;
  /**
   * Optional second pass that may look at the disk. Returns a replacement
   * explanation, or null to keep the first one.
   */
  probe?(details: Details, context: ErrorContext, fs: ProbeFs): Promise<Explanation | null>;
}
