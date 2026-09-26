import { describe, expect, it } from "vitest";

import { dottedNameAt } from "./hover";

describe("dottedNameAt", () => {
  it("finds a whole dotted chain from the middle", () => {
    const text = "y = model.layer1.weight + 1";
    const pos = text.indexOf("layer1") + 2;
    expect(dottedNameAt(text, pos)).toEqual({ name: "model.layer1.weight", from: 4, to: 23 });
  });

  it("stops at brackets: x[0] yields x", () => {
    const text = "print(x[0])";
    expect(dottedNameAt(text, 6)?.name).toBe("x");
  });

  it("works when hovering just after the last character", () => {
    const text = "df ";
    expect(dottedNameAt(text, 2)?.name).toBe("df");
  });

  it("trims a dangling dot while typing", () => {
    const text = "df.";
    expect(dottedNameAt(text, 1)).toEqual({ name: "df", from: 0, to: 2 });
  });

  it("returns the chain when hovering a dot inside it", () => {
    const text = "a.b.c";
    expect(dottedNameAt(text, 1)?.name).toBe("a.b.c");
  });

  it("excludes keywords and common builtins", () => {
    expect(dottedNameAt("for i in xs:", 1)).toBeNull();
    expect(dottedNameAt("print(x)", 2)).toBeNull();
    expect(dottedNameAt("self.w", 1)).toBeNull();
  });

  it("excludes numbers and empty spots", () => {
    expect(dottedNameAt("x = 1234", 6)).toBeNull();
    expect(dottedNameAt("a + b", 2)).toBeNull();
    expect(dottedNameAt("", 0)).toBeNull();
  });

  it("rejects chains with a non-identifier segment", () => {
    expect(dottedNameAt("a.1b", 0)).toBeNull();
  });
});
