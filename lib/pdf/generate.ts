/**
 * HTML → PDF (conventions.md §8, FR-22).
 *
 * The same Chromium the E2E suite drives, launched headless, handed the
 * document from print-html.ts, asked for `page.pdf()`.
 *
 * ── setContent, not goto ─────────────────────────────────────────────────────
 * conventions.md §8 describes a route the browser NAVIGATES to. It navigates to
 * nothing: the markup is built in-process and injected. Three reasons, and the
 * first is fatal on its own.
 *
 *  1. The print route is behind the session, and this browser has none. Giving
 *     it one would mean minting a credential that exists so a robot can read a
 *     tenant's artwork — a second door into the files, built for convenience.
 *  2. A Server Action that HTTP-fetches its own server is a request waiting on
 *     the process that is waiting on it. Under `next dev`, which compiles a
 *     route on first hit, that is a deadlock with a two-minute timeout on it.
 *  3. `localhost` inside the server is not `localhost` in a browser elsewhere —
 *     the exact class of failure that made every preview in this product an
 *     empty box (CLAUDE.md, and the comment atop lib/storage/minio.ts).
 *
 * /print/issue/[id] still exists and still serves the identical HTML, because a
 * person debugging a layout needs to see the document in a browser. It is a
 * window onto the builder, not a step in the pipeline.
 *
 * ── Why `playwright-core` and not `playwright` ───────────────────────────────
 * `playwright` exists to DOWNLOAD browsers; the browser is already on the
 * machine because the E2E suite put it there. Core is the same driver without
 * the installer, and it is in `serverExternalPackages` for the same reason
 * sharp is: it resolves a platform binary at runtime and cannot be bundled.
 */
import type { Browser } from "playwright-core";

import { printQualityScale } from "@/lib/domain/print-quality";

/**
 * Validation rule 13. A render that has not finished in two minutes is not
 * slow, it is stuck — a font that never resolves, artwork that never decodes —
 * and the person who pressed the button needs an error, not a spinner.
 */
export const PDF_TIMEOUT_MS = 120_000;

export class PdfGenerationError extends Error {
  constructor(message = "הפקת ה־PDF נכשלה") {
    super(message);
    this.name = "PdfGenerationError";
  }
}

/**
 * Renders one document and returns the bytes.
 *
 * `printQuality` is free text (docs/erd.md) and is resolved by
 * lib/domain/print-quality.ts — three recognised words, everything else lands
 * on `standard`. It reaches Chromium as the context's `deviceScaleFactor`,
 * which is what decides how the embedded artwork is rasterised; the page
 * geometry is vector and does not move with it.
 */
export async function renderPdf(
  html: string,
  printQuality: string | null | undefined,
): Promise<Buffer> {
  const { chromium } = await import("playwright-core");

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      // Required wherever the app runs as root or inside a container without
      // user namespaces, which is both the dev VPS and any sane deployment.
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
      timeout: PDF_TIMEOUT_MS,
    });

    const context = await browser.newContext({
      deviceScaleFactor: printQualityScale(printQuality),
    });
    const page = await context.newPage();
    page.setDefaultTimeout(PDF_TIMEOUT_MS);

    // Every image is a data: URI, so "networkidle" would be waiting for a
    // network that is never used. `load` fires once the images have decoded,
    // which is the thing actually worth waiting for.
    await page.setContent(html, { waitUntil: "load", timeout: PDF_TIMEOUT_MS });

    const pdf = await withTimeout(
      page.pdf({
        // The document declares its own trim size in @page; honouring it keeps
        // one source of truth for the page size instead of two that can drift.
        preferCSSPageSize: true,
        printBackground: true,
        // The margin is already inside every absolute offset (print-html.ts).
        margin: { top: "0", bottom: "0", left: "0", right: "0" },
      }),
      PDF_TIMEOUT_MS,
    );

    return Buffer.from(pdf);
  } catch (error) {
    if (error instanceof PdfGenerationError) throw error;
    console.error("[pdf] render failed", error);
    throw new PdfGenerationError();
  } finally {
    // Closing is not optional: a leaked Chromium survives the request and the
    // next one launches beside it, until the box runs out of memory doing
    // nothing.
    await browser?.close().catch(() => {});
  }
}

/**
 * The two-minute ceiling.
 *
 * Playwright's own timeouts cover navigation and actions; `page.pdf()` on a
 * page that has already loaded is neither, so it gets its own.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new PdfGenerationError("הפקת ה־PDF עברה שתי דקות ונקטעה")),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * An HTML page to a PNG — the tear sheet (14/10/2026). Chromium, like the PDF,
 * because the caption is Hebrew and nothing else on the box shapes Hebrew text
 * correctly; the page itself arrives as an image, so this only composes.
 */
export async function renderPng(html: string, widthPx: number): Promise<Buffer> {
  const { chromium } = await import("playwright-core");
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
      timeout: PDF_TIMEOUT_MS,
    });
    const page = await browser.newPage({ viewport: { width: widthPx, height: 100 } });
    page.setDefaultTimeout(PDF_TIMEOUT_MS);
    await page.setContent(html, { waitUntil: "load", timeout: PDF_TIMEOUT_MS });
    return Buffer.from(await page.screenshot({ fullPage: true, type: "png" }));
  } catch (error) {
    console.error("[tear-sheet] render failed", error);
    throw new PdfGenerationError("יצירת הגזיר נכשלה");
  } finally {
    await browser?.close().catch(() => {});
  }
}
