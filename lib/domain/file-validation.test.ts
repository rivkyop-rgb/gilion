import { describe, expect, it } from "vitest";

import {
  checkAdFile,
  formatBytes,
  sniffFileType,
  smallestLimit,
  tooLargeMessage,
  UNSUPPORTED_TYPE_MESSAGE,
} from "./ad-file";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n");
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

const MB = 1024 * 1024;
const alpha = { maxBytes: 10 * MB, newspaperName: "עיתון השבוע" };
const catalogue = { maxBytes: 5 * MB, newspaperName: "קטלוג המרכז" };

describe("sniffFileType", () => {
  it("recognises all three supported formats by their leading bytes", () => {
    expect(sniffFileType(PDF)).toBe("pdf");
    expect(sniffFileType(JPG)).toBe("jpg");
    expect(sniffFileType(PNG)).toBe("png");
  });

  it("refuses a text file that merely calls itself .pdf", () => {
    // The whole reason the check exists: the NAME says pdf, the bytes do not.
    const impostor = Buffer.from("this is definitely not a pdf, promise");
    expect(sniffFileType(impostor)).toBeNull();
  });

  it("refuses a GIF, which is a real image the system still does not take", () => {
    expect(sniffFileType(Buffer.from("GIF89a"))).toBeNull();
  });

  it("accepts a PDF whose %PDF marker sits behind leading junk", () => {
    // Real-world PDFs do this, and every reader tolerates it.
    const padded = Buffer.concat([Buffer.alloc(120, 0x20), PDF]);
    expect(sniffFileType(padded)).toBe("pdf");
  });

  it("does not mistake a truncated PNG signature for a PNG", () => {
    expect(sniffFileType(Buffer.from([0x89, 0x50, 0x4e]))).toBeNull();
  });
});

describe("checkAdFile", () => {
  it("passes a file inside the newspaper's limit", () => {
    const result = checkAdFile({ size: 3 * MB, head: PNG, limit: alpha });
    expect(result).toEqual({ ok: true, fileType: "png" });
  });

  it("names the newspaper and both sizes when the file is too large", () => {
    const result = checkAdFile({ size: 12 * MB, head: PDF, limit: alpha });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.code).toBe("size");
    expect(result.rejection.message).toContain("עיתון השבוע");
    expect(result.rejection.message).toContain("10 MB");
    expect(result.rejection.message).toContain("12 MB");
  });

  it("checks size before type, so an oversized junk file is never read", () => {
    const result = checkAdFile({ size: 50 * MB, head: Buffer.from("junk"), limit: alpha });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.code).toBe("size");
  });

  it("rejects an unsupported type that is comfortably within the limit", () => {
    const result = checkAdFile({ size: 1024, head: Buffer.from("GIF89a"), limit: alpha });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.message).toBe(UNSUPPORTED_TYPE_MESSAGE);
  });

  it("rejects an empty file", () => {
    const result = checkAdFile({ size: 0, head: Buffer.alloc(0), limit: alpha });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.code).toBe("unreadable");
  });

  /**
   * FR-21 in one test: the SAME file, the SAME bytes, two newspapers, two
   * answers. A hard-coded ceiling anywhere in the code makes this fail.
   */
  it("accepts an 8 MB file for a 10 MB newspaper and refuses it for a 5 MB one", () => {
    const eightMb = { size: 8 * MB, head: PDF };
    expect(checkAdFile({ ...eightMb, limit: alpha }).ok).toBe(true);
    expect(checkAdFile({ ...eightMb, limit: catalogue }).ok).toBe(false);
  });
});

describe("smallestLimit", () => {
  it("picks the strictest newspaper, because that is the one that can refuse", () => {
    const limit = smallestLimit([
      { id: "a", name: "עיתון השבוע", maxAdFileSize: 10 * MB },
      { id: "b", name: "קטלוג המרכז", maxAdFileSize: 5 * MB },
    ]);
    expect(limit).toEqual({ maxBytes: 5 * MB, newspaperName: "קטלוג המרכז" });
  });

  it("has nothing to say about a business with no newspapers yet", () => {
    expect(smallestLimit([])).toBeNull();
  });
});

describe("formatBytes", () => {
  it("drops a trailing .0 but keeps a real fraction", () => {
    expect(formatBytes(10 * MB)).toBe("10 MB");
    expect(formatBytes(5.5 * MB)).toBe("5.5 MB");
  });

  it("falls back to kilobytes below one megabyte", () => {
    expect(formatBytes(400 * 1024)).toBe("400 KB");
  });
});

describe("tooLargeMessage", () => {
  it("is in Hebrew and names the newspaper that refused", () => {
    expect(tooLargeMessage(8 * MB, catalogue)).toContain("קטלוג המרכז");
  });
});
