/** File URIs for the language server, on both path styles. */

export function pathToUri(path: string): string {
  // Windows: C:\a\b -> file:///C:/a/b ; POSIX: /a/b -> file:///a/b
  let p = path.replace(/\\/g, "/");
  if (!p.startsWith("/")) p = `/${p}`;
  return `file://${encodeURI(p).replace(/[?#]/g, encodeURIComponent)}`;
}

export function uriToPath(uri: string): string {
  if (!uri.startsWith("file://")) return uri;
  let p = decodeURIComponent(uri.slice("file://".length));
  // file:///C:/a -> C:/a on Windows-style drive paths.
  if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
  return p;
}
