/**
 * Bytes on disk to editor text and back, without silently changing the file.
 *
 * CodeMirror keeps lines joined by "\n" whatever the file used, so the line
 * ending and a UTF-8 byte order mark are remembered on open and restored on
 * save. Files that are not UTF-8 text (binaries opened by mistake, Latin-1
 * exports) are refused: decoding them would replace bytes with U+FFFD and the
 * next save would corrupt the file.
 */

export interface TextFormat {
  /** The file started with a UTF-8 byte order mark. */
  bom: boolean;
  eol: "\n" | "\r\n";
}

export const DEFAULT_FORMAT: TextFormat = { bom: false, eol: "\n" };

/** Larger files make the editor crawl; open them with something else. */
export const MAX_EDITABLE_BYTES = 50 * 1024 * 1024;

/** How far to look for a NUL byte when guessing "binary". */
const BINARY_SNIFF_BYTES = 8000;

const BOM = String.fromCharCode(0xfeff);

export function decodeText(bytes: Uint8Array): { text: string; format: TextFormat } {
  if (bytes.length > MAX_EDITABLE_BYTES) {
    const mb = Math.round(bytes.length / (1024 * 1024));
    throw new Error(`the file is ${mb} MB, too large to edit here`);
  }
  if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) {
    throw new Error("it looks like a binary file, not text");
  }
  let raw: string;
  try {
    raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error("it is not UTF-8 text. Re-save it as UTF-8 in another editor first");
  }
  const bom = raw.startsWith(BOM);
  const body = bom ? raw.slice(1) : raw;
  const crlf = (body.match(/\r\n/g) ?? []).length;
  const lf = (body.match(/\n/g) ?? []).length - crlf;
  const eol = crlf > 0 && crlf >= lf ? "\r\n" : "\n";
  return { text: body.replace(/\r\n?/g, "\n"), format: { bom, eol } };
}

/** Editor text ("\n" lines) to what goes back on disk. */
export function encodeText(text: string, format: TextFormat): string {
  const body = format.eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text;
  return format.bom ? BOM + body : body;
}
