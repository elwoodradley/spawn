import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { completionChangesText, typedPrefix } from "./completionKeys";

describe("typedPrefix", () => {
  it("returns the identifier fragment before the cursor", () => {
    const state = EditorState.create({ doc: "    return name" });
    expect(typedPrefix(state, state.doc.length)).toBe("name");
    expect(typedPrefix(state, 4)).toBe("");
    const dotted = EditorState.create({ doc: "np.ar" });
    expect(typedPrefix(dotted, 5)).toBe("ar");
  });
});

describe("completionChangesText", () => {
  it("is false when the completion equals what is typed", () => {
    expect(completionChangesText("name", { label: "name" })).toBe(false);
    expect(completionChangesText("name", { label: "name", apply: "name" })).toBe(false);
  });

  it("is true when accepting would insert something", () => {
    expect(completionChangesText("na", { label: "name" })).toBe(true);
    expect(completionChangesText("name", { label: "NameError" })).toBe(true);
    expect(completionChangesText("name", { label: "name", apply: "name()" })).toBe(true);
  });

  it("trusts a function apply unless the label is the typed word", () => {
    const fn = () => {};
    expect(completionChangesText("name", { label: "name", apply: fn })).toBe(false);
    expect(completionChangesText("na", { label: "name", apply: fn })).toBe(true);
  });
});
