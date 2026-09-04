/**
 * The two PDFs an issue has (US-008 AC-3, AC-5, FR-13, FR-15, FR-22).
 *
 *   ?type=draft   render now, stream, keep nothing
 *   ?type=final   stream the file the close wrote
 *
 * ── Why this is a Route Handler and not a Server Action ──────────────────────
 * conventions.md §9: actions for writes, route handlers for FILES. A browser
 * cannot be handed a few megabytes by an action and told to save them; it needs
 * a response with a Content-Disposition on it.
 *
 * ── Why it is addressed by issue id and not by object key ────────────────────
 * conventions.md §5 routes stored files through /api/files/[...key], and that
 * route stays exactly as it is — it answers "may this person read THIS object",
 * which is the right question for an advertisement, whose key is the only name
 * it has. An issue PDF is different: it has an id, the permission is about the
 * ISSUE, and one of the two types has no object at all. Sending a draft through
 * a key-addressed door would have meant inventing a key for a file that is
 * never stored.
 *
 * Everything it refuses, it refuses as 404 rather than 403 — a "forbidden"
 * would confirm the issue exists in somebody else's business.
 */
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

import { canReadArea, canWriteArea, getTenantContext } from "@/lib/auth/tenant";
import { generateDraftPdf, PdfGenerationError } from "@/lib/data/issue-pdf";
import { getIssue } from "@/lib/data/issues";
import { getObjectStream, statObject } from "@/lib/storage/minio";

const NOT_FOUND = new NextResponse("not found", { status: 404 });

/** A render can take a while — this route is never a static asset. */
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const type = new URL(request.url).searchParams.get("type") ?? "final";
  if (type !== "draft" && type !== "final") return NOT_FOUND;

  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NOT_FOUND;
  }

  // Producing a PDF is `pdf: write`; downloading the one that exists is
  // `pdf: read`, which is what lets a sales rep answer "did my customer's ad
  // run" without being able to declare an issue finished (07-pdf.md §הרשאות).
  const allowed = type === "draft" ? canWriteArea(ctx, "pdf") : canReadArea(ctx, "pdf");
  if (!allowed) return NOT_FOUND;

  // Tenant-scoped read — a foreign issue id gets no further than this.
  const issue = await getIssue(ctx.businessId, id);
  if (!issue) return NOT_FOUND;

  if (type === "draft") {
    try {
      const rendered = await generateDraftPdf(
        {
          businessId: ctx.businessId,
          userId: ctx.userId,
          isAdmin: ctx.role === "admin" || ctx.isSuperAdmin,
        },
        id,
      );
      if (!rendered) return NOT_FOUND;
      return download(rendered.bytes, rendered.fileName);
    } catch (error) {
      const message = error instanceof PdfGenerationError ? error.message : "הפקת ה־PDF נכשלה";
      return new NextResponse(message, {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  }

  if (!issue.final_pdf_url) return NOT_FOUND;

  let stream;
  try {
    stream = await getObjectStream(issue.final_pdf_url);
  } catch {
    // The row names a file the store does not have. Nothing to serve.
    return NOT_FOUND;
  }
  const stat = await statObject(issue.final_pdf_url);

  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      ...pdfHeaders(`${issue.newspaper.name} ${isoOf(issue.issue_date)}.pdf`),
      // Private: the answer depends on who asked, and a shared cache handing
      // one business's issue to another's browser is the failure §5 exists for.
      "Cache-Control": "private, max-age=60",
      ...(stat ? { "Content-Length": String(stat.size) } : {}),
    },
  });
}

function download(bytes: Buffer, fileName: string): NextResponse {
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      ...pdfHeaders(fileName),
      // A draft is generated fresh every time, on purpose (FR-22).
      "Cache-Control": "no-store",
      "Content-Length": String(bytes.length),
    },
  });
}

function pdfHeaders(fileName: string): Record<string, string> {
  return {
    "Content-Type": "application/pdf",
    // RFC 5987, so a Hebrew file name survives the round trip.
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  };
}

const isoOf = (d: Date) => d.toISOString().slice(0, 10);
