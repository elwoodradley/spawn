import { describe, expect, it } from "vitest";

import { promote } from "./promote";

const series = (name: string, n: number) => ({
  name,
  points: Array.from({ length: n }, (_, i) => ({ step: i, value: i })),
});

describe("promote", () => {
  it("charts series with three or more points and keeps the rest as scalars", () => {
    const { charted, scalars } = promote([
      series("loss", 40),
      series("hidden", 1),
      series("accuracy", 2),
    ]);
    expect(charted.map((s) => s.name)).toEqual(["loss"]);
    expect(scalars.map((s) => s.name)).toEqual(["hidden", "accuracy"]);
  });

  it("promotes a scalar once it reaches three points", () => {
    expect(promote([series("acc", 3)]).charted).toHaveLength(1);
  });
});
