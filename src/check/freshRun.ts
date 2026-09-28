/**
 * Check 1: does the whole file run, from nothing, with no console state?
 *
 * The runner starts `python -u <file>` with stdin closed and captures the
 * output; this module turns the result into a checklist item. A traceback
 * becomes a red item with the exception in plain words and a jump to the
 * innermost frame inside the project. `EOFError` from `input()` means the
 * program wanted a person at the keyboard, which is a note, not a failure.
 */
import { fileFrames, parseCroak, type Croak, type CroakFrame } from "../spawn/croak";
import type { CheckItem, CheckLink } from "./model";
import type { RunResult } from "./process";

/** What a first-course student needs to hear about each common exception. */
const PLAIN_WORDS: Record<string, string> = {
  NameError:
    "uses a name that was never defined in this file. It probably only existed in the Interactive Console.",
  ModuleNotFoundError: "imports a module that is not installed in the selected Python Interpreter.",
  ImportError: "cannot import something it needs. Check the module name and that it is installed.",
  FileNotFoundError: "tries to open a file that does not exist from the folder it runs in.",
  ZeroDivisionError: "divides by zero somewhere.",
  IndexError: "uses a list index that is out of range.",
  KeyError: "looks up a dictionary key that is not there.",
  TypeError: "uses a value of the wrong type, for example adding a number to a string.",
  ValueError: "gets a value of the right type but with a content it cannot use.",
  AttributeError: "uses an attribute or method the object does not have (often a typo).",
  SyntaxError: "has a syntax error, so Python cannot even start it.",
  IndentationError: "has inconsistent indentation.",
  RecursionError: "calls a function inside itself without ever stopping.",
  AssertionError: "fails one of its own assert statements.",
  MemoryError: "runs out of memory.",
  KeyboardInterrupt: "was interrupted.",
};

export function plainWords(type: string): string | null {
  return PLAIN_WORDS[type] ?? null;
}

/** The innermost frame that belongs to the project (or the file itself). */
export function innermostProjectFrame(
  croak: Croak,
  root: string | null,
  file: string,
): CroakFrame | null {
  const inside = (f: CroakFrame) =>
    f.file === file ||
    (root !== null && (f.file.startsWith(`${root}/`) || f.file.startsWith(`${root}\\`)));
  const frames = fileFrames(croak).filter(inside);
  return frames[frames.length - 1] ?? null;
}

/** The last traceback in the captured stderr, if any. */
export function lastTraceback(stderr: string): Croak | null {
  const start = stderr.lastIndexOf("Traceback (most recent call last):");
  const candidate = start === -1 ? stderr : stderr.slice(start);
  return parseCroak(candidate.trimEnd());
}

export function freshRunItem(
  result: RunResult,
  ctx: { file: string; root: string | null; timeoutSeconds: number },
): CheckItem {
  const detail = [result.stdout, result.stderr].filter((s) => s.length > 0).join("\n") || undefined;
  if (result.startFailure) {
    return {
      id: "fresh",
      state: "fail",
      title: `Could not start Python: ${result.startFailure}`,
      hint: "Choose a working interpreter with Select Python Interpreter.",
      action: { label: "Select Python Interpreter", command: "metamorphosis.open" },
    };
  }
  if (result.cancelled) {
    return { id: "fresh", state: "skip", title: "Fresh run was cancelled", detail };
  }
  if (result.timedOut) {
    const minutes = Math.round(ctx.timeoutSeconds / 60);
    return {
      id: "fresh",
      state: "warn",
      title: `Still running after ${minutes === 1 ? "1 minute" : `${minutes} minutes`}, stopped`,
      hint: "If the program is meant to take this long, that is fine. If not, look for a loop that never ends.",
      detail,
    };
  }
  const croak = lastTraceback(result.stderr);
  if (croak?.type === "EOFError") {
    return {
      id: "fresh",
      state: "warn",
      title: "This program asks for input. Run it yourself with F5 and answer the prompts.",
      hint: "The check runs without a keyboard, so input() had nothing to read.",
      detail,
    };
  }
  if (result.code === 0) {
    return {
      id: "fresh",
      state: "pass",
      title: "The whole file runs from a fresh start (exit code 0)",
      detail,
    };
  }
  if (croak) {
    const frame = innermostProjectFrame(croak, ctx.root, ctx.file);
    const link: CheckLink | undefined = frame ? { file: frame.file, line: frame.line } : undefined;
    const words = plainWords(croak.type);
    const message = croak.message ? `${croak.type}: ${croak.message}` : croak.type;
    return {
      id: "fresh",
      state: "fail",
      title: `Stops with ${message}`,
      hint: words
        ? `The program ${words}${frame ? ` See line ${frame.line}.` : ""}`
        : frame
          ? `See line ${frame.line} of ${frame.file.split(/[\\/]/).pop() ?? frame.file}.`
          : undefined,
      link,
      detail,
    };
  }
  return {
    id: "fresh",
    state: "fail",
    title:
      result.code === null
        ? "The program was killed before it finished"
        : `The program stopped with exit code ${result.code}`,
    hint: "Open the details to read its output.",
    detail,
  };
}
