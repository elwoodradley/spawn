// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { sanitizeSvg } from "./sanitizeSvg";

describe("sanitizeSvg", () => {
  it("keeps drawing elements", () => {
    const out = sanitizeSvg('<svg viewBox="0 0 10 10"><path d="M0 0L10 10" stroke="red"/></svg>');
    expect(out).toContain("<path");
    expect(out).toContain('stroke="red"');
  });

  it("drops scripts and event handlers", () => {
    const out = sanitizeSvg(
      '<svg onload="alert(1)"><script>alert(2)</script><rect width="1" onclick="x()"/></svg>',
    );
    expect(out).not.toContain("script");
    expect(out).not.toContain("onload");
    expect(out).not.toContain("onclick");
    expect(out).toContain("<rect");
  });
});
