/**
 * One file from the designer's page — `zip`, a publication id, or
 * `preview-<publication id>` for the thumbnail. Same signed gate as the page.
 */
import { NextResponse } from "next/server";

import { verifyLayoutPackageToken } from "@/lib/layout-package-token";
import {
  businessOfIssue,
  layoutPackage,
  layoutPackageZip,
  packageFileName,
} from "@/lib/data/layout-package";
import { getObject } from "@/lib/storage/minio";

export const dynamic = "force-dynamic";

const NOT_FOUND = () => new NextResponse("not found", { status: 404 });

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  png: "image/png",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; token: string; file: string }> },
) {
  const { id, token, file } = await params;
  if (!verifyLayoutPackageToken(id, token)) return NOT_FOUND();
  const businessId = await businessOfIssue(id);
  if (!businessId) return NOT_FOUND();
  const pkg = await layoutPackage(businessId, id);
  if (!pkg) return NOT_FOUND();

  if (file === "zip") {
    const zip = await layoutPackageZip(pkg);
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(packageFileName(pkg))}`,
        "cache-control": "private, no-store",
      },
    });
  }

  const preview = file.startsWith("preview-");
  const item = pkg.items.find((i) => i.publicationId === (preview ? file.slice(8) : file));
  const key = preview ? item?.file?.previewUrl : item?.file?.key;
  if (!item?.file || !key) return NOT_FOUND();

  let bytes: Buffer;
  try {
    bytes = await getObject(key);
  } catch {
    // The row names a file the store no longer has — a miss, not a crash.
    return NOT_FOUND();
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type":
        TYPES[(preview ? key.split(".").pop() : item.file.fileType) ?? ""] ??
        (key.endsWith(".webp") ? "image/webp" : "application/octet-stream"),
      ...(preview
        ? {}
        : {
            "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(item.zipName ?? item.file.name)}`,
          }),
      "cache-control": "private, max-age=600",
    },
  });
}
