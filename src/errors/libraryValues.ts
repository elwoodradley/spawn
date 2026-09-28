/**
 * Text that is not a number, text mixed with numbers, and calls with the
 * wrong number of arguments. Pure, like `library.ts`.
 */
import { define } from "./entry";
import type { Explanation } from "./types";

// 15. Text that is not a number ----------------------------------------------

interface BadNumber {
  target: string;
  text: string;
}

const badNumber = define<BadNumber>({
  id: "bad-number",
  matches(type, message) {
    if (type !== "ValueError") return null;
    const f = /^could not convert string to float: '(.*)'/.exec(message);
    if (f) return { target: "float", text: f[1] ?? "" };
    const i = /^invalid literal for int\(\) with base 10: '(.*)'/.exec(message);
    if (i) return { target: "int", text: i[1] ?? "" };
    return null;
  },
  describe({ target, text }) {
    const empty = text.trim() === "";
    return {
      id: "bad-number",
      title: empty
        ? `${target}() was given empty text`
        : `${target}() was given text that is not a number: '${text}'`,
      body: [
        empty
          ? "Converting an empty string fails: nothing was typed, or a line in the file is blank."
          : `${target}() only accepts digits${target === "float" ? ", a decimal point" : ""} and a sign. Words, units, commas and stray spaces make it fail.`,
      ],
      todo: [
        "input() and file reading give text; check what the text really is with print(repr(value)) before converting, and strip() it.",
      ],
    };
  },
});

// 16. Text mixed with numbers, wrong argument count ---------------------------

interface BadTypes {
  detail: string;
}

const badTypes = define<BadTypes>({
  id: "bad-types",
  matches(type, message) {
    if (type !== "TypeError" || /NoneType/.test(message)) return null;
    if (/can only concatenate str \(not "(int|float)"\) to str/.test(message)) {
      return { detail: "concat" };
    }
    const op = /unsupported operand type\(s\) for ([^:]+): '(\w+)' and '(\w+)'/.exec(message);
    if (
      op &&
      [op[2], op[3]].includes("str") &&
      [op[2], op[3]].some((t) => t === "int" || t === "float")
    ) {
      return { detail: "operand" };
    }
    if (/'[<>]=?' not supported between instances of 'str' and '(int|float)'/.test(message)) {
      return { detail: "compare" };
    }
    if (/must be str, not (int|float)/.test(message)) return { detail: "concat" };
    return null;
  },
  describe(): Explanation {
    return {
      id: "bad-types",
      title: "Text and a number were combined as if they were the same kind of thing",
      body: [
        "Python does not silently turn '5' into 5 or 5 into '5'. input() always gives text, and so does reading a file.",
      ],
      todo: [
        "Convert the text first, int(x) or float(x), or turn the number into text with str(n) or an f-string when you are building a message.",
      ],
    };
  },
});

interface BadArity {
  fn: string;
  expected: string;
  given: string;
  missing: string | null;
}

const badArity = define<BadArity>({
  id: "bad-arity",
  matches(type, message) {
    if (type !== "TypeError") return null;
    const many =
      /^(\S+)\(\) takes (\d+|no|from \d+ to \d+) positional arguments? but (\d+) (?:was|were) given/.exec(
        message,
      );
    if (many?.[1] && many[2] && many[3])
      return { fn: many[1], expected: many[2], given: many[3], missing: null };
    const few = /^(\S+)\(\) missing (\d+) required positional arguments?: (.+)$/.exec(message);
    if (few?.[1] && few[2] && few[3])
      return { fn: few[1], expected: "", given: "", missing: few[3] };
    return null;
  },
  describe({ fn, expected, given, missing }) {
    if (missing !== null) {
      return {
        id: "bad-arity",
        title: `${fn}() was called without ${missing}`,
        body: [`The function needs those arguments and the call did not supply them.`],
        todo: [
          "If this is a method, check that it is called on an instance (obj.method()) rather than on the class.",
        ],
      };
    }
    const off = Number(given) - Number(expected);
    return {
      id: "bad-arity",
      title: `${fn}() was called with ${given} arguments but takes ${expected}`,
      body: [
        off === 1
          ? `One extra argument. In a class, every method needs self as its first parameter: def ${fn.split(".").pop() ?? fn}(self, ...). Python passes the instance automatically, which is the extra one.`
          : "The call and the def do not agree on how many values are passed.",
      ],
      todo: off === 1 ? [] : ["Compare the call with the def line, argument by argument."],
    };
  },
});

export { badArity, badNumber, badTypes };
