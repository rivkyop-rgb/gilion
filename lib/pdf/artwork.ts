/**
 * Turning a stored ad file into something an HTML page can draw.
 *
 * ── Why the artwork is rasterised at all ─────────────────────────────────────
 * Two thirds of the ads in this product are PDFs, and `<img src="…pdf">` draws
 * nothing. The preview PNG that stage 05 already made is no help either: it is
 * 640px wide, sized for a card in the library, and a press asked to print that
 * across a quarter page produces exactly the blur a customer complains about.
 * So the print pipeline rasterises the ORIGINAL file at a resolution derived
 * from the newspaper's own print_quality, and never reuses the preview.
 *
 * ── Why base64 and not a URL ─────────────────────────────────────────────────
 * conventions.md §5: no object URL is ever exposed. The browser doing the
 * rendering here is a headless Chromium the server launched, with no session
 * and no cookie — it could not authenticate against /api/files even if we
 * wanted it to. Embedding the bytes is both the private answer and the only
 * working one.
 *
 * pdf-to-img is imported lazily and is listed in serverExternalPackages: bundled,
 * it looks for its pdf.js worker against the bundle and fails SILENTLY
 * (CLAUDE.md). Everything here that can fail reports why, because an ad that
 * quietly does not print is the worst outcome this stage has.
 */
import { getObject } from "@/lib/storage/minio";
import { printQualityScale } from "@/lib/domain/print-quality";

/** Points per inch in a PDF — `scale` in pdf-to-img multiplies this. */
const PDF_POINTS_PER_INCH = 72;

/**
 * Dots per inch at `standard`. Halved for a draft, one and a half times it for
 * `high`, by way of printQualityScale's 1 / 2 / 3.
 */
const BASE_DPI = 100;

/** Above this a tabloid page of full-bleed artwork stops being worth the RAM. */
const MAX_PDF_SCALE = 6;

export type ArtworkSource = {
  /** Object key of the live file — never a URL (conventions.md §5). */
  fileUrl: string;
  fileType: string;
};

/**
 * A `data:` URI for one ad, or null when it cannot be produced.
 *
 * Null is not silent: the caller draws a labelled hole in the page and the
 * close is refused before it, because finding 3 has already flagged an ad that
 * cannot be read. This function exists to be honest about the leftovers — an
 * object the store lost, a PDF that opens and rasterises to nothing.
 */
export async function artworkDataUri(
  source: ArtworkSource,
  printQuality: string | null | undefined,
): Promise<string | null> {
  try {
    const bytes = await getObject(source.fileUrl);
    if (bytes.length === 0) return null;

    if (source.fileType === "pdf") {
      const png = await rasterizeFirstPage(bytes, printQuality);
      return png ? `data:image/png;base64,${png.toString("base64")}` : null;
    }

    const mime = source.fileType === "png" ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch (error) {
    console.warn("[pdf] artwork could not be loaded", source.fileUrl, error);
    return null;
  }
}

async function rasterizeFirstPage(
  bytes: Buffer,
  printQuality: string | null | undefined,
): Promise<Buffer | null> {
  const dpi = BASE_DPI * printQualityScale(printQuality);
  const scale = Math.min(dpi / PDF_POINTS_PER_INCH, MAX_PDF_SCALE);

  const { pdf } = await import("pdf-to-img");
  const document = await pdf(bytes, { scale });
  for await (const page of document) return Buffer.from(page);
  return null;
}

/**
 * The same thing for a reserved area's asset — a masthead, a house strip.
 *
 * Always an image: an asset is uploaded through the reserved-area editor, which
 * accepts pictures only, so there is no PDF branch to take.
 */
export async function assetDataUri(key: string): Promise<string | null> {
  try {
    const bytes = await getObject(key);
    if (bytes.length === 0) return null;
    const mime = key.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch (error) {
    console.warn("[pdf] reserved-area asset could not be loaded", key, error);
    return null;
  }
}
