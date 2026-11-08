/**
 * The seven-step upload pipeline (docs/plan/05-advertisements.md §צנרת ההעלאה).
 *
 * The order is the design, not an accident:
 *   1. size, from the declared length — reject before reading the whole file
 *   2. magic bytes, not the extension
 *   3. the NEWSPAPER's max_ad_file_size (FR-21) — no constant anywhere
 *   4. actually open it: pdf-lib for PDF, sharp for images
 *   5. write to MinIO under {businessId}/ads/{adId}/…
 *   6. render a preview PNG
 *   7. mark it passed
 *
 * Steps 1–3 are pure and live in lib/domain/ad-file.ts. This module is the
 * impure half: it opens files and talks to the object store.
 */
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import {
  checkAdFile,
  UNREADABLE_MESSAGE,
  type AdFileType,
  type SizeLimit,
} from "@/lib/domain/ad-file";
import { CONTENT_TYPES, putObject } from "./minio";

/** How wide the preview PNG is. Big enough for the detail panel, small enough
 * that a library of forty cards is not forty full-page images. */
const PREVIEW_WIDTH = 640;

export type StoredFile = {
  fileType: AdFileType;
  size: number;
  bytes: Buffer;
  /** The first page / the image, as printed — only the ratio is used. */
  width: number | null;
  height: number | null;
};

export type PipelineFailure = {
  ok: false;
  /** `unreadable` is the only failure that still becomes a stored, visible row
   * — the caller distinguishes on the code, not on the Hebrew text. */
  code: "type" | "size" | "unreadable";
  message: string;
  /**
   * Set only for `unreadable`, where the magic bytes DID identify the format
   * and only the contents are broken. The row that gets stored takes its type
   * from here rather than from the file name — the whole point of sniffing is
   * that the name is not evidence, and that does not stop being true because
   * the file failed to open.
   */
  fileType?: AdFileType;
};
export type PipelineSuccess = { ok: true; file: StoredFile };

/**
 * Steps 1–4. Returns the bytes when the file is genuinely openable, and a
 * Hebrew reason when it is not.
 *
 * A file that fails here is still RECORDED — the library shows it with a red
 * banner (US-005 AC-2) — so the caller keeps the message rather than throwing.
 */
export async function inspectAdFile(
  bytes: Buffer,
  declaredSize: number,
  limit: SizeLimit,
  name?: string,
): Promise<PipelineFailure | PipelineSuccess> {
  const checked = checkAdFile({ size: declaredSize, head: bytes.subarray(0, 4096), limit, name });
  if (!checked.ok) {
    return { ok: false, code: checked.rejection.code, message: checked.rejection.message };
  }

  const openable = await measure(bytes, checked.fileType);
  if (!openable) {
    return {
      ok: false,
      code: "unreadable",
      message: UNREADABLE_MESSAGE,
      fileType: checked.fileType,
    };
  }

  return {
    ok: true,
    file: { fileType: checked.fileType, size: bytes.length, bytes, ...openable },
  };
}

/**
 * Step 4 — the difference between "starts with %PDF" and "is a PDF", and the
 * file's proportions while it is open anyway (12/10/2026).
 *
 * A truncated file passes the magic-byte check and fails here, which is
 * exactly the case US-005 AC-2 calls a corrupt file.
 */
async function measure(
  bytes: Buffer,
  type: AdFileType,
): Promise<{ width: number | null; height: number | null } | null> {
  try {
    if (type === "pdf") {
      const doc = await PDFDocument.load(bytes, { updateMetadata: false });
      if (doc.getPageCount() === 0) return null;
      // The page as it is SHOWN: a rotated page reports its unrotated size.
      const page = doc.getPage(0);
      const { width, height } = page.getSize();
      const turned = Math.abs(page.getRotation().angle) % 180 === 90;
      return turned ? { width: height, height: width } : { width, height };
    }
    const meta = await sharp(bytes).metadata();
    if (!meta.width || !meta.height) return null;
    // EXIF orientations 5-8 are a quarter turn: a phone photo stored sideways.
    const turned = (meta.orientation ?? 1) >= 5;
    return turned
      ? { width: meta.height, height: meta.width }
      : { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

/** Step 5. */
export async function storeAdFile(key: string, file: StoredFile): Promise<void> {
  await putObject(key, file.bytes, CONTENT_TYPES[file.fileType]!);
}

/**
 * Step 6 — the preview PNG, "where possible".
 *
 * A PDF is rasterised through pdf-to-img (pdfjs + a prebuilt canvas), which is
 * imported lazily: it pulls in the whole pdfjs worker, and an upload of a JPG
 * has no business paying for that. When rasterising fails the ad is still
 * perfectly valid — the card falls back to a PDF icon, which is what the
 * design already draws for that case.
 */
export async function renderPreview(file: StoredFile): Promise<Buffer | null> {
  try {
    const source = file.fileType === "pdf" ? await firstPdfPage(file.bytes) : file.bytes;
    if (!source) return null;
    return await sharp(source)
      .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
      // Not a brand colour: this is the paper a transparent PDF or PNG is
      // composited onto before it becomes a thumbnail. It is what the ad will
      // be PRINTED on, so it does not follow the interface theme and must not
      // be settable from the admin panel.
      // eslint-disable-next-line no-restricted-syntax
      .flatten({ background: "#ffffff" })
      .png()
      .toBuffer();
  } catch (error) {
    // A missing preview is not a failed upload, but it must not be SILENT
    // either: swallowing this is what turns a bundling problem into "the
    // feature just doesn't work" with nothing in the log to go on.
    console.warn("[ads] preview rendering failed", error);
    return null;
  }
}

async function firstPdfPage(bytes: Buffer): Promise<Buffer | null> {
  const { pdf } = await import("pdf-to-img");
  const document = await pdf(bytes, { scale: 1.5 });
  for await (const page of document) return Buffer.from(page);
  return null;
}
