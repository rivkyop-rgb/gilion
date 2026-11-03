/** The image or the file itself, behind the same signed gate as the page. */
import { NextResponse } from "next/server";

import { verifyAdViewToken } from "@/lib/ad-view-token";
import { adViewOf } from "@/lib/data/misfit-publications";
import { getObject } from "@/lib/storage/minio";

export const dynamic = "force-dynamic";

const NOT_FOUND = () => new NextResponse("not found", { status: 404 });

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; token: string; file: string }> },
) {
  const { id, token, file } = await params;
  if (!verifyAdViewToken(id, token)) return NOT_FOUND();
  if (file !== "preview" && file !== "file") return NOT_FOUND();
  const view = await adViewOf(id);
  const key = file === "preview" ? view?.ad.previewKey : view?.ad.fileKey;
  if (!view || !key) return NOT_FOUND();

  let bytes: Buffer;
  try {
    bytes = await getObject(key);
  } catch {
    return NOT_FOUND();
  }
  const ext = (file === "preview" ? key.split(".").pop() : view.ad.fileType) ?? "";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": TYPES[ext.toLowerCase()] ?? "application/octet-stream",
      ...(file === "file"
        ? {
            "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
              view.ad.name.includes(".") ? view.ad.name : `${view.ad.name}.${ext}`,
            )}`,
          }
        : {}),
      "cache-control": "private, max-age=600",
    },
  });
}
