/**
 * The errors students hit most, explained in plain words. Each entry pulls
 * the details out of the real message with a regex and says what happened,
 * what to look at, and, where SPAWN can help, what button to offer.
 *
 * Everything here is pure and rule-based; `match.ts` runs the list in order
 * and the first match wins. The other entries live in `libraryFiles.ts`,
 * `librarySyntax.ts`, `libraryValues.ts`, `shapes.ts` and `libraryMl.ts`.
 */

import { define } from "./entry";
import { throughLibrary } from "./frames";
import { packageFor } from "./packages";

function quote(name: string): string {
  return `'${name}'`;
}

// 1. Missing module ----------------------------------------------------------

interface MissingModule {
  module: string;
}

const missingModule = define<MissingModule>({
  id: "missing-module",
  matches(type, message) {
    if (type !== "ModuleNotFoundError" && type !== "ImportError") return null;
    const m = /^No module named '?([\w.]+)'?/.exec(message);
    return m?.[1] ? { module: m[1] } : null;
  },
  describe({ module }) {
    const guess = packageFor(module);
    if (guess.packageName === null) {
      return {
        id: "missing-module",
        title: `${guess.module} is part of Python itself but this interpreter was built without it`,
        body: [
          `Python looked for the module ${quote(module)} and did not find it. It is not a package you can install; it comes with Python, and this Python was built without it.`,
        ],
        todo: ["Select a different Python Interpreter from the status bar, or reinstall Python."],
      };
    }
    const named =
      guess.packageName === guess.module
        ? ""
        : ` The package that provides it is called ${guess.packageName}.`;
    const body = [
      `Python looked for the module ${quote(module)} in the interpreter this project uses and did not find it.${named}`,
    ];
    if (!guess.known) {
      // No one-click install for a name SPAWN does not know: a typo such as
      // `sklern` would install whatever package happens to own that name.
      return {
        id: "missing-module",
        title: `${guess.module} isn't installed, or the name is misspelled`,
        body,
        todo: [
          `If ${guess.module} is one of your own files, check that ${guess.module}.py sits next to this file, or in the folder the program runs from.`,
          `If it is a package, check the spelling and the package's real name on pypi.org, then install it from a terminal in the project folder, for example: uv add ${guess.packageName}`,
        ],
      };
    }
    return {
      id: "missing-module",
      title: `${guess.module} isn't installed in this project's environment`,
      body,
      todo: [],
      actions: [{ kind: "install", packageName: guess.packageName, moduleName: guess.module }],
    };
  },
  async probe({ module }, context, fs) {
    // An unknown name that is a file in the project is the student's own
    // module (tests/test_x.py importing solution.py from the root). The
    // install button would fetch an unrelated package of that name from PyPI.
    const guess = packageFor(module);
    if (guess.known || guess.packageName === null) return null;
    const top = guess.module;
    for (const dir of new Set([context.projectRoot, context.cwd])) {
      if (!dir) continue;
      const own =
        (await fs.exists(fs.join(dir, `${top}.py`))) || (await fs.exists(fs.join(dir, top)));
      if (!own) continue;
      return {
        id: "missing-module",
        title: `${top} is your own module, but Python cannot see it from this file`,
        body: [
          `${top} is in ${dir}. Python looks for imports in the folder of the file you run and in the installed packages, not in the project as a whole. Installing a package called ${guess.packageName} would not help.`,
        ],
        todo: [`Move the file you run next to ${top}, or run a file that sits beside it.`],
      };
    }
    return null;
  },
});

// 6. Undefined name ----------------------------------------------------------

interface UndefinedName {
  name: string;
  suggestion: string | null;
  local: boolean;
}

const undefinedName = define<UndefinedName>({
  id: "undefined-name",
  matches(type, message) {
    if (type === "NameError") {
      const m = /^name '([^']+)' is not defined(?:\. Did you mean: '([^']+)'\?)?/.exec(message);
      return m?.[1] ? { name: m[1], suggestion: m[2] ?? null, local: false } : null;
    }
    if (type === "UnboundLocalError") {
      const m =
        /^(?:cannot access local variable '([^']+)'|local variable '([^']+)' referenced before assignment)/.exec(
          message,
        );
      const name = m?.[1] ?? m?.[2];
      return name ? { name, suggestion: null, local: true } : null;
    }
    return null;
  },
  describe({ name, suggestion, local }, context) {
    if (local) {
      return {
        id: "undefined-name",
        title: `${name} is used inside a function before it has a value there`,
        body: [
          `Because the function assigns to ${name} somewhere, Python treats ${name} as local to that function for the whole function, so reading it before that assignment fails, even if a ${name} exists outside.`,
        ],
        todo: [
          `Pass ${name} in as a parameter and return the new value, or assign it before you read it.`,
        ],
      };
    }
    const inConsole = context.consoleVariables.some((v) => v.name === name);
    if (inConsole && context.source === "run") {
      return {
        id: "undefined-name",
        title: `${name} exists in the Interactive Console but not in this file`,
        body: [
          `A run with F5 starts a fresh Python process, which knows nothing the console has. Define ${name} in the file before you use it.`,
        ],
      };
    }
    const todo = suggestion
      ? [`Python suggests ${quote(suggestion)}: probably a typo.`]
      : [
          "Check the spelling, including capital letters.",
          `Make sure the line that creates ${name} runs before this one, and is not inside a function or an if that did not run.`,
        ];
    if (!suggestion && context.source === "console") {
      todo.push(
        `In the Interactive Console, a cell only knows what earlier cells have run. Run the cell that defines ${name} first.`,
      );
    }
    return {
      id: "undefined-name",
      title: `Nothing called ${name} has been defined yet`,
      body: [
        `Python reached a name it has never seen. Names are only known after the line that creates them has run.`,
      ],
      todo,
    };
  },
});

// 7. Missing key or column ---------------------------------------------------

interface MissingKey {
  key: string;
  pandas: boolean;
}

const missingKey = define<MissingKey>({
  id: "missing-key",
  matches(type, message, frames) {
    if (type !== "KeyError") return null;
    const key = message.replace(/^['"]|['"]$/g, "");
    if (!key) return null;
    return { key, pandas: throughLibrary(frames, "pandas") };
  },
  describe({ key, pandas }, context) {
    if (pandas) {
      const frame = context.consoleVariables.find((v) => /DataFrame/.test(v.type));
      const hint = frame
        ? `The Interactive Console holds a DataFrame, ${frame.name}: print ${frame.name}.columns to see its column names.`
        : "Print df.columns to see the names the DataFrame really has.";
      return {
        id: "missing-key",
        title: `There is no column named ${quote(key)}`,
        body: [
          `Column names must match exactly, including capital letters, spaces and underscores.`,
        ],
        todo: [hint],
      };
    }
    return {
      id: "missing-key",
      title: `The dictionary has no key ${quote(key)}`,
      body: [`Looking up a key that was never added raises this. Keys are compared exactly.`],
      todo: [
        `Check with ${quote(key)} in d first, or use d.get(${quote(key)}) to get None instead of an error.`,
      ],
    };
  },
});

// 8. Index out of range ------------------------------------------------------

interface BadIndex {
  what: string;
  index: number | null;
  size: number | null;
  axis: string | null;
}

const badIndex = define<BadIndex>({
  id: "bad-index",
  matches(type, message) {
    if (type !== "IndexError") return null;
    const plain = /^(list|tuple|string|list assignment|range object) index out of range/.exec(
      message,
    );
    if (plain?.[1])
      return { what: plain[1].replace(" assignment", ""), index: null, size: null, axis: null };
    const numbered =
      /^index (-?\d+) is out of bounds for (?:axis|dimension) (\d+) with size (\d+)/.exec(message);
    if (numbered?.[1] && numbered[2] && numbered[3]) {
      return {
        what: "array",
        index: Number(numbered[1]),
        size: Number(numbered[3]),
        axis: numbered[2],
      };
    }
    return null;
  },
  describe({ what, index, size, axis }) {
    const facts =
      index !== null && size !== null
        ? [
            { label: "Asked for", value: `position ${index}${axis ? ` on axis ${axis}` : ""}` },
            { label: "Available", value: `${size} items, positions 0 to ${size - 1}` },
          ]
        : [];
    return {
      id: "bad-index",
      title: `The ${what} has fewer items than the position you asked for`,
      body: [
        `Positions start at 0, so a ${what} with n items has positions 0 to n-1. Asking for n, or for anything past the end, raises this.`,
      ],
      facts,
      todo: [
        `Check the loop bound (range(len(x)) not range(len(x)+1)) and whether the ${what} is empty.`,
      ],
    };
  },
});

// 9. None where a value was expected -----------------------------------------

interface NoneUsed {
  tried: string;
}

const noneUsed = define<NoneUsed>({
  id: "none-used",
  matches(type, message) {
    if ((type !== "TypeError" && type !== "AttributeError") || !/NoneType/.test(message))
      return null;
    if (/not subscriptable/.test(message)) return { tried: "index it with [ ]" };
    if (/not iterable/.test(message)) return { tried: "loop over it" };
    if (/not callable/.test(message)) return { tried: "call it like a function" };
    if (/has no len/.test(message)) return { tried: "take its length" };
    const attr = /has no attribute '([^']+)'/.exec(message);
    if (attr?.[1]) return { tried: `use .${attr[1]} on it` };
    return { tried: "use it in a calculation" };
  },
  describe({ tried }) {
    return {
      id: "none-used",
      title: "Something here is None, not the value you expected",
      body: [
        `A variable holds None and the code tried to ${tried}. None is what a function returns when it has no return statement, and what methods like list.sort() or random.shuffle() return: they change the list in place and give back None.`,
      ],
      todo: [
        "Find which name is None (print it just before this line) and follow it back to where it was assigned.",
      ],
    };
  },
});

// 10. Division by zero, recursion --------------------------------------------

const divisionByZero = define<true>({
  id: "division-by-zero",
  matches: (type) => (type === "ZeroDivisionError" ? true : null),
  describe: () => ({
    id: "division-by-zero",
    title: "Something was divided by zero",
    body: [
      "The value on the right of / , // or % was 0. Often it is a total that is still 0, or the average of an empty list.",
    ],
    todo: ["Print the divisor before this line, and handle the empty or zero case first."],
  }),
});

const recursion = define<true>({
  id: "recursion",
  matches: (type, message) =>
    type === "RecursionError" && /maximum recursion depth exceeded/.test(message) ? true : null,
  describe: () => ({
    id: "recursion",
    title: "A function kept calling itself and never stopped",
    body: [
      "Python allows about 1000 nested calls. Reaching that limit almost always means a recursive function has no base case, or the base case is never reached because the argument does not get smaller each call.",
    ],
    todo: ["Check the stopping condition and that every recursive call moves towards it."],
  }),
});

export { badIndex, divisionByZero, missingKey, missingModule, noneUsed, recursion, undefinedName };
