import { describe, expect, it } from "vitest";

import { clampSidebar, SIDEBAR_MIN } from "./layout";

describe("clampSidebar", () => {
  it("keeps the sidebar between its minimum and the given maximum", () => {
    expect(clampSidebar(10, 720)).toBe(SIDEBAR_MIN);
    expect(clampSidebar(300, 720)).toBe(300);
    expect(clampSidebar(2000, 720)).toBe(720);
  });
});
