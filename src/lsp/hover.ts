/**
 * One hover tooltip with two sources: what the language server knows about
 * the name (type, signature, docstring) and, when the Interactive Console is
 * idle and has the name, what the value is right now. Docs first, live value
 * beneath. Replaces the library's hoverTooltips so there is a single box.
 */
import { LSPPlugin } from "@codemirror/lsp-client";
import { hoverTooltip, type EditorView, type Tooltip } from "@codemirror/view";
import { render } from "solid-js/web";

import { dottedNameAt, HOVER_TIME_MS, inspectName } from "../editor/hover";
import { HoverCard } from "../editor/HoverCard";
import type { DisplayPayload } from "../pool/protocol";

interface HoverResult {
  contents?: string | { kind?: string; value: string } | Array<string | { value: string }>;
  range?: { start: { line: number; character: number }; end: { line: number; character: number } };
}

function contentsToMarkup(plugin: LSPPlugin, contents: HoverResult["contents"]): string {
  if (!contents) return "";
  if (Array.isArray(contents)) {
    return contents.map((c) => plugin.docToHTML(typeof c === "string" ? c : c.value)).join("");
  }
  if (typeof contents === "string") return plugin.docToHTML(contents);
  return plugin.docToHTML({
    kind: contents.kind === "plaintext" ? "plaintext" : "markdown",
    value: contents.value,
  });
}

async function source(view: EditorView, pos: number): Promise<Tooltip | null> {
  const plugin = LSPPlugin.get(view);
  const line = view.state.doc.lineAt(pos);
  const hit = dottedNameAt(line.text, pos - line.from);

  let docsHtml = "";
  let from = pos;
  let to = pos;
  if (plugin && plugin.client.connected) {
    try {
      const result = await plugin.client.request<
        { textDocument: { uri: string }; position: { line: number; character: number } },
        HoverResult | null
      >("textDocument/hover", {
        textDocument: { uri: plugin.uri },
        position: plugin.toPosition(pos),
      });
      if (result) {
        docsHtml = contentsToMarkup(plugin, result.contents);
        if (result.range) {
          from = plugin.fromPosition(result.range.start);
          to = plugin.fromPosition(result.range.end);
        }
      }
    } catch {
      docsHtml = "";
    }
  }

  let live: DisplayPayload | null = null;
  if (hit) {
    live = await inspectName(hit.name);
    if (from === to) {
      from = line.from + hit.from;
      to = line.from + hit.to;
    }
  }

  if (!docsHtml && !live) return null;
  const name = hit?.name ?? "";
  return {
    pos: from,
    end: to,
    above: true,
    create() {
      const dom = document.createElement("div");
      dom.className = "sp-hover sp-hover--merged";
      let dispose: (() => void) | null = null;
      if (docsHtml) {
        const docs = document.createElement("div");
        docs.className = "sp-hover__docs";
        docs.innerHTML = docsHtml; // sanitized by the client's sanitizeHTML
        dom.appendChild(docs);
      }
      if (live) {
        const host = document.createElement("div");
        host.className = "sp-hover__live";
        dom.appendChild(host);
        const payload = live;
        dispose = render(() => HoverCard({ name, payload }), host);
      }
      return { dom, destroy: () => dispose?.() };
    },
  };
}

export function mergedHover() {
  return hoverTooltip(source, { hoverTime: HOVER_TIME_MS, hideOnChange: true });
}
