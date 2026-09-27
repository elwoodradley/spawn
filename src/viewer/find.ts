/**
 * Find-in-document for the viewer: wrap matches in <mark> elements inside a
 * container and step through them. Pure DOM, no library. Case-insensitive
 * plain text; a query under two characters clears the highlights.
 */

export const MARK_CLASS = "sp-docx-match";
export const CURRENT_CLASS = "is-current";

export function clearMarks(root: HTMLElement): void {
  for (const mark of Array.from(root.querySelectorAll(`mark.${MARK_CLASS}`))) {
    const parent = mark.parentNode;
    if (!parent) continue;
    parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
    parent.normalize();
  }
}

/** Highlight every occurrence of `query`; returns the marks in document order. */
export function markMatches(root: HTMLElement, query: string): HTMLElement[] {
  clearMarks(root);
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement && !["SCRIPT", "STYLE", "MARK"].includes(node.parentElement.tagName)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  const textNodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) textNodes.push(n as Text);

  const marks: HTMLElement[] = [];
  for (const node of textNodes) {
    const text = node.data;
    const lower = text.toLowerCase();
    let from = lower.indexOf(needle);
    if (from === -1) continue;
    const frag = document.createDocumentFragment();
    let cursor = 0;
    while (from !== -1) {
      frag.appendChild(document.createTextNode(text.slice(cursor, from)));
      const mark = document.createElement("mark");
      mark.className = MARK_CLASS;
      mark.textContent = text.slice(from, from + needle.length);
      frag.appendChild(mark);
      marks.push(mark);
      cursor = from + needle.length;
      from = lower.indexOf(needle, cursor);
    }
    frag.appendChild(document.createTextNode(text.slice(cursor)));
    node.parentNode?.replaceChild(frag, node);
  }
  return marks;
}

/** Make one match current, scroll it into view, and return its index. */
export function focusMatch(marks: readonly HTMLElement[], index: number): number {
  if (marks.length === 0) return -1;
  const i = ((index % marks.length) + marks.length) % marks.length;
  marks.forEach((m, k) => m.classList.toggle(CURRENT_CLASS, k === i));
  const target = marks[i];
  // jsdom has no scrollIntoView; the browser does.
  if (target && typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ block: "center" });
  }
  return i;
}
