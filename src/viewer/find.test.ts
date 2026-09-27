// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { isViewerPath, sanitize } from "./docx";
import { clearMarks, focusMatch, markMatches } from "./find";

describe("isViewerPath", () => {
  it("recognises .docx in any case and nothing else", () => {
    expect(isViewerPath("/a/Assignment 3.docx")).toBe(true);
    expect(isViewerPath("/a/notes.DOCX")).toBe(true);
    expect(isViewerPath("/a/main.py")).toBe(false);
    expect(isViewerPath("/a/docx")).toBe(false);
    expect(isViewerPath(null)).toBe(false);
  });
});

describe("sanitize", () => {
  it("keeps content and data images, drops script and javascript links", () => {
    const html =
      '<h1>T</h1><p onclick="x()">hi <a href="javascript:alert(1)">bad</a> <a href="https://ok">ok</a></p>' +
      '<img src="data:image/png;base64,AAA"><script>x()</script><table><tr><td>1</td></tr></table>';
    const out = sanitize(html);
    expect(out).toContain("<h1>T</h1>");
    expect(out).toContain('href="https://ok"');
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("<script");
    expect(out).toContain('src="data:image/png;base64,AAA"');
    expect(out).toContain("<td>1</td>");
  });
});

describe("markMatches", () => {
  it("wraps every case-insensitive match and can step through them", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>Loop until Done. loop again.</p><pre>while not done:</pre>";
    const marks = markMatches(root, "loop");
    expect(marks).toHaveLength(2);
    expect(root.querySelectorAll("mark")).toHaveLength(2);
    expect(focusMatch(marks, 1)).toBe(1);
    expect(marks[1]?.classList.contains("is-current")).toBe(true);
    expect(focusMatch(marks, 2)).toBe(0);
    clearMarks(root);
    expect(root.querySelectorAll("mark")).toHaveLength(0);
    expect(root.textContent).toBe("Loop until Done. loop again.while not done:");
  });

  it("ignores queries shorter than two characters", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>a a a</p>";
    expect(markMatches(root, "a")).toHaveLength(0);
  });
});
