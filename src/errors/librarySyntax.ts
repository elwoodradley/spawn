/**
 * Syntax and indentation errors, input at end-of-file, and wrong attribute
 * names. Pure, like `library.ts`.
 */
import { define } from "./entry";

// 12. Syntax and indentation -------------------------------------------------

interface Syntax {
  type: string;
  message: string;
  line: number | null;
}

interface SyntaxRule {
  re: RegExp;
  title: string;
  body: (m: RegExpExecArray) => string;
  todo?: string;
}

const SYNTAX_RULES: SyntaxRule[] = [
  {
    re: /unterminated (?:triple-quoted )?(?:f-)?string literal|EOL while scanning string literal/,
    title: "A string is missing its closing quote",
    body: () => "Python reached the end of the line (or file) while still inside a string.",
    todo: "Add the matching quote, and check that a quote inside the text is escaped or uses the other quote character.",
  },
  {
    re: /'(.)' was never closed|unexpected EOF while parsing/,
    title: "A bracket was opened and never closed",
    body: (m) =>
      m[1]
        ? `The ${m[1]} on the line Python points at has no matching closing bracket, so everything after it was read as part of the same expression.`
        : "Python ran out of file while still waiting for a closing bracket.",
    todo: "Count the ( [ { on that line; the missing one is often on the line before the one reported.",
  },
  {
    re: /Perhaps you forgot a comma/,
    title: "A comma is probably missing between two items",
    body: () =>
      "Two values sit next to each other with nothing between them, usually inside a list, tuple or call.",
  },
  {
    re: /expected ':'/,
    title: "A colon is missing at the end of the line",
    body: () =>
      "Lines that start a block (if, elif, else, for, while, def, class, try, with) must end with a colon.",
  },
  {
    re: /expected an indented block after (.+?) on line (\d+)/,
    title: "The block after a line ending in a colon is empty",
    body: (m) =>
      `The ${m[1] ?? "statement"} on line ${m[2] ?? "?"} needs at least one indented line under it.`,
    todo: "Indent the body by four spaces, or write pass if there is nothing to do yet.",
  },
  {
    re: /unexpected indent/,
    title: "This line is indented more than the one before it",
    body: () =>
      "Indentation is how Python knows where a block starts and ends, so an extra indent where no block was opened is an error.",
    todo: "Line it up with the line above, or open a block (if, for, def ...) that it belongs to.",
  },
  {
    re: /unindent does not match any outer indentation level/,
    title: "This line's indentation matches none of the levels above it",
    body: () =>
      "When a block ends, the next line must go back to exactly one of the earlier indentation levels.",
    todo: "Make every level a multiple of four spaces; select the block and press Tab / Shift+Tab to fix it.",
  },
  {
    re: /inconsistent use of tabs and spaces/,
    title: "This file mixes tabs and spaces for indentation",
    body: () => "Python 3 refuses indentation that mixes the two, even when it looks aligned.",
    todo: "Use spaces everywhere; the editor's Tab key inserts four spaces.",
  },
  {
    re: /Missing parentheses in call to 'print'/,
    title: "print needs parentheses in Python 3",
    body: () => "print x was Python 2. In Python 3, print is a function: print(x).",
  },
  {
    re: /Maybe you meant '==' or ':=' instead of '='|cannot assign to (?:expression|function call|literal|comparison|attribute here)/,
    title: "A single = was used where a comparison == was probably meant",
    body: () =>
      "= assigns a value to a name; == asks whether two things are equal. Only a name can be on the left of =.",
  },
  {
    re: /invalid character '(.)' \(U\+([0-9A-F]+)\)|invalid non-printable character/,
    title: "A character pasted from a document is not one Python understands",
    body: (m) =>
      m[1]
        ? `The character ${m[1]} looks like a quote or dash but is a typographic one, the kind word processors and slides insert.`
        : "An invisible character is hiding in this line, usually pasted from a document.",
    todo: "Delete it and type the plain ' \" or - from the keyboard.",
  },
  {
    re: /invalid decimal literal|invalid syntax\. Perhaps you forgot/,
    title: "A number runs straight into a name",
    body: () =>
      "Something like 2x or 3rd_place: a name cannot start with a digit, and multiplication needs a *.",
  },
];

const syntax = define<Syntax>({
  id: "syntax",
  matches(type, message, frames) {
    if (type !== "SyntaxError" && type !== "IndentationError" && type !== "TabError") return null;
    return { type, message, line: frames[frames.length - 1]?.line ?? null };
  },
  describe({ type, message, line }) {
    const at = line === null ? "" : ` (line ${line})`;
    const rule = SYNTAX_RULES.find((r) => r.re.test(message));
    const m = rule ? rule.re.exec(message) : null;
    if (rule && m) {
      return {
        id: "syntax",
        title: `${rule.title}${at}`,
        body: [rule.body(m)],
        todo: rule.todo ? [rule.todo] : [],
      };
    }
    const indentation = type !== "SyntaxError";
    return {
      id: "syntax",
      title: indentation
        ? `The indentation on this line is wrong${at}`
        : `Python could not read this line${at}`,
      body: [
        indentation
          ? "Blocks must be indented consistently, four spaces per level."
          : "This is not a runtime error: the file was never run. Python stopped while reading it, at the ^ marker in the traceback, or just before it.",
      ],
      todo: indentation
        ? []
        : [
            "Look at the marked line and the line before it: an unclosed bracket, a missing colon, or a missing comma there shows up here.",
          ],
    };
  },
});

// 13. input() at end of file --------------------------------------------------

const eof = define<true>({
  id: "eof",
  matches: (type, message) =>
    type === "EOFError" && /EOF when reading a line|EOF/.test(message) ? true : null,
  describe: () => ({
    id: "eof",
    title: "The program asked for input, but nothing was there",
    body: [
      "input() waits for a line typed in the stdin row at the bottom of the Output panel. Instead it got end-of-file: stdin was closed with Ctrl+D, or the program asked for more lines than were given.",
    ],
    todo: ["Run again and type the answer in the stdin row when the prompt appears."],
  }),
});

// 14. Wrong attribute name ----------------------------------------------------

interface BadAttribute {
  owner: string;
  attribute: string;
  suggestion: string | null;
  module: boolean;
}

const badAttribute = define<BadAttribute>({
  id: "bad-attribute",
  matches(type, message) {
    if (type !== "AttributeError" || /NoneType/.test(message)) return null;
    const m =
      /^(?:(module) '([^']+)'|'([^']+)' object|type object '([^']+)') has no attribute '([^']+)'(?:\. Did you mean: '([^']+)'\?)?/.exec(
        message,
      );
    if (!m?.[5]) return null;
    const owner = m[2] ?? m[3] ?? m[4] ?? "object";
    return { owner, attribute: m[5], suggestion: m[6] ?? null, module: m[1] === "module" };
  },
  describe({ owner, attribute, suggestion, module }) {
    const todo = suggestion
      ? [`Python suggests .${suggestion}: probably a typo.`]
      : module
        ? [
            `Check the spelling in the library's documentation. If it is right, the installed version of ${owner} may be older than the one the example was written for.`,
          ]
        : [
            `If you expected a different kind of value here (a DataFrame, an array, a tensor), print type(x) just before this line to see what it really is.`,
          ];
    return {
      id: "bad-attribute",
      title: module
        ? `The module ${owner} has nothing called ${attribute}`
        : `A ${owner} has no .${attribute}`,
      body: [
        module
          ? `The code asked ${owner} for ${attribute}, and no function or constant with that name exists in it.`
          : `The value is a ${owner}, and a ${owner} has no attribute or method called ${attribute}.`,
      ],
      todo,
    };
  },
});

export { badAttribute, eof, syntax };
