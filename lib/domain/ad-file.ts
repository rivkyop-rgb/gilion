/**
 * Advertisement file validation (US-005, FR-21).
 *
 * Pure module — no Prisma, no MinIO, no fs. Everything here answers "is this
 * byte sequence an ad file this newspaper accepts?", which is exactly the part
 * worth testing without a database or a browser (conventions.md §9).
 *
 * The one rule that matters most: THE FILE TYPE IS DECIDED BY THE FIRST BYTES,
 * never by the name. An extension is something the uploader typed.
 */

/**
 * The ceiling the TRANSPORT can carry, in bytes.
 *
 * Not a validation limit — FR-21 keeps that on the newspaper. This is the
 * Server Action body cap in next.config.ts, and it exists only so a newspaper
 * cannot be configured to allow a file the request could never deliver: a
 * 200 MB limit would produce an upload that fails with a framework error
 * instead of the Hebrew refusal the user is owed. The two numbers must move
 * together, which is why the config imports this one.
 */
export const UPLOAD_TRANSPORT_LIMIT_BYTES = 64 * 1024 * 1024;

export const AD_FILE_TYPES = ["pdf", "jpg", "png"] as const;
export type AdFileType = (typeof AD_FILE_TYPES)[number];

export const AD_FILE_TYPE_LABELS: Record<AdFileType, string> = {
  pdf: "PDF",
  jpg: "JPG",
  png: "PNG",
};

/** The MIME types the file input advertises. UX only — never a check. */
export const AD_ACCEPT_ATTRIBUTE = "application/pdf,image/jpeg,image/png";

/**
 * Magic numbers, longest first so a longer signature is never shadowed by a
 * shorter prefix. PNG's is eight bytes; JPEG's SOI marker is three; `%PDF` is
 * four and may sit behind a byte-order mark or junk, so a PDF is also accepted
 * when the marker appears inside the first kilobyte — that is what every PDF
 * reader does, and rejecting those files would reject real ones.
 */
const SIGNATURES: Array<{ type: AdFileType; bytes: number[] }> = [
  { type: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: "pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { type: "jpg", bytes: [0xff, 0xd8, 0xff] },
];

function startsWith(bytes: Uint8Array, signature: number[], at = 0): boolean {
  if (bytes.length < at + signature.length) return false;
  return signature.every((b, i) => bytes[at + i] === b);
}

/** The %PDF marker is allowed to be preceded by junk, within this window. */
const PDF_SCAN_WINDOW = 1024;

/**
 * What the bytes actually are, or null for anything else.
 *
 * A `.pdf` name over a text file returns null here, which is the whole reason
 * this function exists rather than a `path.extname()` call.
 */
export function sniffFileType(bytes: Uint8Array): AdFileType | null {
  for (const sig of SIGNATURES) {
    if (startsWith(bytes, sig.bytes)) return sig.type;
  }
  const pdf = SIGNATURES.find((s) => s.type === "pdf")!;
  const limit = Math.min(bytes.length - pdf.bytes.length, PDF_SCAN_WINDOW);
  for (let at = 1; at <= limit; at++) {
    if (startsWith(bytes, pdf.bytes, at)) return "pdf";
  }
  return null;
}

/** Whatever the name claims, lower-cased and without the dot. UX only. */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/**
 * Megabytes, the way the requirements card shows them.
 *
 * Rounded to one decimal and trimmed, so 10 MB reads "10 MB" and not
 * "10.0 MB", and 5.5 keeps its half.
 */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${Number(mb.toFixed(1))} MB`;
  const kb = bytes / 1024;
  return `${Number(kb.toFixed(kb >= 10 ? 0 : 1))} KB`;
}

export type AdFileRejection = { code: "type" | "size" | "unreadable"; message: string };

export type AdFileCheck =
  { ok: true; fileType: AdFileType } | { ok: false; rejection: AdFileRejection };

export type SizeLimit = {
  /** Bytes. Comes from Newspaper.max_ad_file_size — never a constant (FR-21). */
  maxBytes: number;
  /** Named in the error so the user knows WHICH newspaper refused the file. */
  newspaperName: string;
};

export function tooLargeMessage(size: number, limit: SizeLimit): string {
  return (
    `הקובץ גדול מהמותר לעיתון ${limit.newspaperName} ` +
    `(מקסימום ${formatBytes(limit.maxBytes)}, הקובץ ${formatBytes(size)})`
  );
}

export const UNSUPPORTED_TYPE_MESSAGE = "סוג הקובץ אינו נתמך. אפשר להעלות PDF, JPG או PNG בלבד";

export const UNREADABLE_MESSAGE = "הקובץ פגום ולא ניתן לפתיחה";

/**
 * Steps 1–3 of the upload pipeline, in the order stage 05 fixes them: size
 * first so an oversized file is refused before anything reads it, then the
 * magic bytes, then the newspaper's own ceiling.
 *
 * Step 4 — actually opening the file — needs pdf-lib and sharp and therefore
 * lives in lib/storage/upload.ts, on the other side of the purity line.
 */
export function checkAdFile(input: {
  size: number;
  head: Uint8Array;
  limit: SizeLimit;
}): AdFileCheck {
  if (input.size <= 0) {
    return { ok: false, rejection: { code: "unreadable", message: "הקובץ ריק" } };
  }
  if (input.size > input.limit.maxBytes) {
    return {
      ok: false,
      rejection: { code: "size", message: tooLargeMessage(input.size, input.limit) },
    };
  }
  const fileType = sniffFileType(input.head);
  if (!fileType) {
    return { ok: false, rejection: { code: "type", message: UNSUPPORTED_TYPE_MESSAGE } };
  }
  return { ok: true, fileType };
}

/**
 * The smallest ceiling across the business's newspapers.
 *
 * Shown when no newspaper is chosen yet: promising the largest would let
 * someone upload a file that no newspaper will actually take, and the point of
 * the requirements card is to prevent that trip.
 */
export function smallestLimit(
  newspapers: Array<{ id: string; name: string; maxAdFileSize: number }>,
): SizeLimit | null {
  if (newspapers.length === 0) return null;
  const smallest = newspapers.reduce((a, b) => (b.maxAdFileSize < a.maxAdFileSize ? b : a));
  return { maxBytes: smallest.maxAdFileSize, newspaperName: smallest.name };
}
