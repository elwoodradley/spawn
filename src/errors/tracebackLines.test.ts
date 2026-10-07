import { describe, expect, it } from "vitest";

import { OutputModel } from "../spawn/output";
import { tracebackEndingAt } from "./tracebackLines";

function cardsFor(stderr: string): string[] {
  const model = new OutputModel();
  model.append("stderr", stderr);
  model.system("exited with code 1 after 0.4s");
  const texts: string[] = [];
  model.lines.forEach((_, i) => {
    const text = tracebackEndingAt(model.lines, i);
    if (text !== null) texts.push(text);
  });
  return texts;
}

const PANDAS_KEY_ERROR = [
  "Traceback (most recent call last):",
  '  File "/venv/lib/python3.12/site-packages/pandas/core/indexes/base.py", line 3805, in get_loc',
  "    return self._engine.get_loc(casted_key)",
  "KeyError: 'price'",
  "",
  "The above exception was the direct cause of the following exception:",
  "",
  "Traceback (most recent call last):",
  '  File "C:\\Users\\sam\\hw3\\clean.py", line 7, in <module>',
  '    print(df["price"])',
  "KeyError: 'price'",
  "",
].join("\r\n");

describe("tracebackEndingAt", () => {
  it("gives a chained exception one card, under the final traceback", () => {
    const cards = cardsFor(PANDAS_KEY_ERROR);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toContain("clean.py");
    expect(cards[0]).not.toContain("base.py");
  });

  it("gives a plain traceback its card", () => {
    const cards = cardsFor(
      'Traceback (most recent call last):\n  File "/p/a.py", line 1, in <module>\n    1/0\nZeroDivisionError: division by zero\n',
    );
    expect(cards).toEqual([
      'Traceback (most recent call last):\n  File "/p/a.py", line 1, in <module>\n    1/0\nZeroDivisionError: division by zero',
    ]);
  });

  it("gives two separate tracebacks a card each", () => {
    const one =
      'Traceback (most recent call last):\n  File "/p/a.py", line 1, in <module>\nValueError: x\n';
    expect(cardsFor(`${one}\n${one}`)).toHaveLength(2);
  });
});
