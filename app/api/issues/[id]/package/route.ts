/**
 * An issue's artwork as one ZIP, for laying it out elsewhere (03/11/2026).
 * Staff only, scoped to the active business; refused as 404 like the PDFs.
 */
import { NextResponse } from "next/server";

import { canReadArea, getTenantContext } from "@/lib/auth/tenant";
import { layoutPackage, layoutPackageZip, packageFileName } from "@/lib/data/layout-package";

export const dynamic = "force-dynamic";

const NOT_FOUND = () => new NextResponse("not found", { status: 404 });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NOT_FOUND();
  }
  if (!canReadArea(ctx, "issues")) return NOT_FOUND();

  const pkg = await layoutPackage(ctx.businessId, id);
  if (!pkg) return NOT_FOUND();

  const zip = await layoutPackageZip(pkg);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(packageFileName(pkg))}`,
      "cache-control": "private, no-store",
    },
  });
}
