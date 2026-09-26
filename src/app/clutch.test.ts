import { describe, expect, it } from "vitest";

import { EMPTY_CLUTCH, normalizeClutch } from "./clutch";

describe("normalizeClutch", () => {
  it("returns defaults for nothing or garbage", () => {
    expect(normalizeClutch(null)).toEqual(EMPTY_CLUTCH);
    expect(normalizeClutch("toad")).toEqual(EMPTY_CLUTCH);
  });

  it("keeps valid fields and drops bad ones", () => {
    const clutch = normalizeClutch({
      brood: "/b",
      tabs: ["/b/a.py", 42, "/b/b.py"],
      active: "",
      sidebarWidth: "wide",
      outputHeight: 300,
      sidebarVisible: false,
      outputVisible: "yes",
      sidebarTab: "pool",
    });
    expect(clutch).toEqual({
      brood: "/b",
      tabs: ["/b/a.py", "/b/b.py"],
      active: null,
      sidebarWidth: 260,
      outputHeight: 300,
      sidebarVisible: false,
      outputVisible: true,
      sidebarTab: "pool",
    });
  });

  it("falls back to the brood tab for an unknown sidebar tab", () => {
    expect(normalizeClutch({ sidebarTab: "lily-pad" }).sidebarTab).toBe("brood");
  });
});
