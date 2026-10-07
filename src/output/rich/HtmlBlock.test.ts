import { describe, expect, it } from "vitest";

import { HEIGHT_MESSAGE, reportedHeight } from "./HtmlBlock";

describe("reportedHeight", () => {
  it("reads the frame's height message", () => {
    expect(reportedHeight({ type: HEIGHT_MESSAGE, height: 120.4 })).toBe(121);
  });

  it("ignores other messages and bad values", () => {
    expect(reportedHeight({ type: "other", height: 10 })).toBeNull();
    expect(reportedHeight({ type: HEIGHT_MESSAGE, height: "10" })).toBeNull();
    expect(reportedHeight({ type: HEIGHT_MESSAGE, height: -1 })).toBeNull();
    expect(reportedHeight(null)).toBeNull();
  });

  it("caps a runaway height", () => {
    expect(reportedHeight({ type: HEIGHT_MESSAGE, height: 1e9 })).toBe(2000);
  });
});
