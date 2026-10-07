import { describe, expect, it } from "vitest";

import { decodeText, encodeText } from "./textFormat";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("decodeText / encodeText", () => {
  it("round-trips CRLF files", () => {
    const { text, format } = decodeText(bytes("a = 1\r\nb = 2\r\n"));
    expect(text).toBe("a = 1\nb = 2\n");
    expect(format).toEqual({ bom: false, eol: "\r\n" });
    expect(encodeText(`${text}c = 3\n`, format)).toBe("a = 1\r\nb = 2\r\nc = 3\r\n");
  });

  it("keeps a UTF-8 byte order mark", () => {
    const { text, format } = decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x78, 0x0a]));
    expect(text).toBe("x\n");
    expect(format.bom).toBe(true);
    expect(new TextEncoder().encode(encodeText(text, format))).toEqual(
      new Uint8Array([0xef, 0xbb, 0xbf, 0x78, 0x0a]),
    );
  });

  it("leaves LF files alone", () => {
    const { text, format } = decodeText(bytes("x\ny\n"));
    expect(encodeText(text, format)).toBe("x\ny\n");
  });

  it("refuses non-UTF-8 text instead of mangling it", () => {
    // "café" in Latin-1.
    expect(() => decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toThrow(/not UTF-8/);
  });

  it("refuses binary files", () => {
    expect(() => decodeText(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]))).toThrow(
      /binary/,
    );
  });
});
