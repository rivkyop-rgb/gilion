/**
 * The printed issue as HTML (conventions.md §8).
 *
 * ── What this is, and what it is not ─────────────────────────────────────────
 * It is NOT a step in the PDF pipeline. lib/pdf/generate.ts builds the same
 * markup in-process and injects it with `setContent` — the reasons are written
 * out at the top of that file, and the short one is that a headless browser the
 * server launched has no session and could not read this route if it tried.
 *
 * What it is: the window onto the builder. A layout that comes out wrong in the
 * PDF is a layout somebody has to be able to LOOK at, with a browser's
 * inspector open, at the exact millimetres the renderer used. Without this
 * route the only way to see the document is to open the PDF, where nothing can
 * be measured.
 *
 * Same permission as producing a draft, and tenant-scoped: it renders every
 * advertiser's artwork on the page, so it is the issue PDF in another wrapper
 * and is guarded like one (FR-13, FR-15).
 */
import { NextResponse } from "next/server";

import { canWriteArea, getTenantContext } from "@/lib/auth/tenant";
import { issuePrintHtml } from "@/lib/data/issue-pdf";

const NOT_FOUND = new NextResponse("not found", { status: 404 });

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = new URL(request.url).searchParams.get("draft") === "1";

  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NOT_FOUND;
  }
  if (!canWriteArea(ctx, "pdf")) return NOT_FOUND;

  const html = await issuePrintHtml(ctx.businessId, id, draft);
  if (html === null) return NOT_FOUND;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // The artwork is embedded as base64, so this document IS the tenant's
      // files. It never enters a shared cache.
      "Cache-Control": "no-store",
    },
  });
}
