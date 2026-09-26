import { describe, expect, it } from "vitest";

import {
  countCaptureGroups,
  parseOptionalInt,
  stepZoom,
  validatePattern,
  validatePatternName,
  zoomLabel,
} from "./settingsHelpers";

describe("stepZoom", () => {
  it("steps by a tenth without float noise", () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1.1, 1)).toBe(1.2);
    expect(stepZoom(1.1, -1)).toBe(1);
  });

  it("clamps to the allowed range", () => {
    expect(stepZoom(3, 1)).toBe(3);
    expect(stepZoom(0.5, -1)).toBe(0.5);
  });

  it("labels as a percentage", () => {
    expect(zoomLabel(1.2)).toBe("120%");
    expect(zoomLabel(0.85)).toBe("85%");
  });
});

describe("validatePattern", () => {
  it("accepts one capture group", () => {
    expect(validatePattern("val_loss[:=]\\s*(\\d+\\.\\d+)")).toBeNull();
  });

  it("rejects empty, invalid, zero and multiple groups", () => {
    expect(validatePattern("")).toMatch(/Enter/);
    expect(validatePattern("(")).toBeTruthy();
    expect(validatePattern("loss \\d+")).toMatch(/capture group/);
    expect(validatePattern("(a)(b)")).toMatch(/exactly one/);
  });

  it("does not count escaped parens, classes or non-capturing groups", () => {
    expect(countCaptureGroups("\\((\\d+)\\)")).toBe(1);
    expect(countCaptureGroups("[(](\\d+)")).toBe(1);
    expect(countCaptureGroups("(?:x)(\\d+)")).toBe(1);
  });
});

describe("validatePatternName", () => {
  it("requires a short non-empty name", () => {
    expect(validatePatternName("")).toBeTruthy();
    expect(validatePatternName("x".repeat(30))).toBeTruthy();
    expect(validatePatternName("val_loss")).toBeNull();
  });
});

describe("parseOptionalInt", () => {
  it("treats empty as null and clamps", () => {
    expect(parseOptionalInt("", 8, 40)).toBeNull();
    expect(parseOptionalInt("abc", 8, 40)).toBeNull();
    expect(parseOptionalInt("99", 8, 40)).toBe(40);
    expect(parseOptionalInt("14", 8, 40)).toBe(14);
  });
});
