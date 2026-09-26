import { describe, expect, it } from "vitest";

import { pushRecent, RECENT_MAX, removeRecent } from "./recent";

describe("pushRecent", () => {
  it("puts the newest first and removes duplicates", () => {
    expect(pushRecent(["/a", "/b"], "/b")).toEqual(["/b", "/a"]);
    expect(pushRecent(["/a", "/b"], "/c")).toEqual(["/c", "/a", "/b"]);
  });

  it("caps the list", () => {
    const list = Array.from({ length: RECENT_MAX }, (_, i) => `/p${i}`);
    const next = pushRecent(list, "/new");
    expect(next).toHaveLength(RECENT_MAX);
    expect(next[0]).toBe("/new");
    expect(next).not.toContain(`/p${RECENT_MAX - 1}`);
  });

  it("honours a custom max", () => {
    expect(pushRecent(["/a", "/b"], "/c", 2)).toEqual(["/c", "/a"]);
  });
});

describe("removeRecent", () => {
  it("removes only the matching entry", () => {
    expect(removeRecent(["/a", "/b", "/a"], "/a")).toEqual(["/b"]);
  });
});
