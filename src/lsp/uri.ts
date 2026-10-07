/**
 * File URIs for the language server, on both path styles.
 *
 * Pyright answers with URIs normalised the way VS Code writes them: every
 * character outside `A-Za-z0-9-._~` percent-encoded and a Windows drive
 * written `c%3A`. The editor matches diagnostics to documents by exact URI,
 * so ours must be spelled the same way or a file in `ML (copy)`, or any file
 * on Windows, never shows a diagnostic.
 */

function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function pathToUri(path: string): string {
  // Windows: C:\a\b -> file:///c%3A/a/b ; POSIX: /a/b -> file:///a/b
  let p = path.replace(/\\/g, "/");
  const drive = /^([A-Za-z]):/.exec(p);
  if (drive?.[1]) p = `${drive[1].toLowerCase()}${p.slice(1)}`;
  if (!p.startsWith("/")) p = `/${p}`;
  return `file://${p.split("/").map(encodeSegment).join("/")}`;
}

export function uriToPath(uri: string): string {
  if (!uri.startsWith("file://")) return uri;
  let p = decodeURIComponent(uri.slice("file://".length));
  // file:///C:/a -> C:/a on Windows-style drive paths.
  if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
  return p;
}
