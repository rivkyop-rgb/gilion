/** The import template — a CSV Excel opens in Hebrew (BOM), header + example. */
import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/tenant";
import { TEMPLATE_ROWS } from "@/lib/domain/customer-import";

export async function GET() {
  try {
    await getTenantContext();
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const body = "﻿" + TEMPLATE_ROWS.map((r) => r.map(cell).join(",")).join("\r\n");
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent("תבנית ייבוא לקוחות.csv")}`,
    },
  });
}
