/**
 * One tear sheet, by its signed link (14/10/2026).
 *
 * Public on purpose: the link goes to a customer by mail, and the customer may
 * have no account. The signature is the whole gate — verified before anything
 * is read — and everything refused is 404, never 403, so a wrong link does not
 * confirm that a publication exists.
 *
 * `?download=1` makes it a file to save; without it the image opens in the tab.
 */
import { NextResponse } from "next/server";

import { verifyTearSheetToken } from "@/lib/tear-sheet-token";
import { businessOfPublication, tearSheetFileName, tearSheetImage } from "@/lib/data/tear-sheets";

const NOT_FOUND = () => new NextResponse("not found", { status: 404 });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; token: string }> },
) {
  const { id, token } = await params;
  if (!verifyTearSheetToken(id, token)) return NOT_FOUND();

  const businessId = await businessOfPublication(id);
  if (!businessId) return NOT_FOUND();

  const png = await tearSheetImage(businessId, id);
  if (!png) return NOT_FOUND();

  const download = new URL(request.url).searchParams.has("download");
  const name = await tearSheetFileName(businessId, id);
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      // Private: a proof is the customer's, not a CDN's.
      "cache-control": "private, max-age=3600",
    },
  });
}
