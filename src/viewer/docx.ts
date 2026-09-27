/**
 * Word documents as readable HTML. mammoth converts the .docx structure
 * (headings, lists, tables, emphasis, images, code-styled runs) into clean
 * markup; DOMPurify then strips anything that is not plain content, so a
 * handout can never run script or reach the app.
 */
import DOMPurify from "dompurify";
import mammoth from "mammoth";

/** Extensions the viewer opens instead of the editor. */
export const VIEWER_EXTENSIONS = new Set(["docx"]);

export function isViewerPath(path: string | null): boolean {
  if (!path) return false;
  const dot = path.lastIndexOf(".");
  return dot !== -1 && VIEWER_EXTENSIONS.has(path.slice(dot + 1).toLowerCase());
}

/**
 * Word styles that should read as code. Course handouts put pseudocode in
 * "Code", "Source Code" or "HTML Preformatted"; mammoth's default map knows
 * none of them.
 */
const STYLE_MAP = [
  "p[style-name='Code'] => pre.sp-docx-code:separator('\\n')",
  "p[style-name='Source Code'] => pre.sp-docx-code:separator('\\n')",
  "p[style-name='HTML Preformatted'] => pre.sp-docx-code:separator('\\n')",
  "p[style-name='Preformatted Text'] => pre.sp-docx-code:separator('\\n')",
  "p[style-name='Pseudocode'] => pre.sp-docx-code:separator('\\n')",
  "r[style-name='Code Char'] => code",
  "r[style-name='Source Code Char'] => code",
  "r[style-name='HTML Code'] => code",
  "p[style-name='Title'] => h1.sp-docx-title:fresh",
  "p[style-name='Subtitle'] => p.sp-docx-subtitle:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote:fresh",
];

export interface DocxResult {
  html: string;
  /** Conversion notes mammoth raised (unsupported features), deduplicated. */
  warnings: string[];
}

export async function docxToHtml(bytes: ArrayBuffer): Promise<DocxResult> {
  const result = await mammoth.convertToHtml(
    { arrayBuffer: bytes },
    { styleMap: STYLE_MAP, includeDefaultStyleMap: true, ignoreEmptyParagraphs: true },
  );
  const warnings = [...new Set(result.messages.map((m) => m.message))];
  return { html: sanitize(result.value), warnings };
}

/** Keep content markup and data-URI images; drop everything else. */
export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|data:image\/)/i,
    FORBID_TAGS: ["style", "form", "input", "button", "iframe", "object", "embed"],
    FORBID_ATTR: ["style", "onerror", "onload"],
    ADD_ATTR: ["target"],
  });
}
