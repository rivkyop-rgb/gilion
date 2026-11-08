/**
 * A table as a CSV file Excel opens in Hebrew (08/11/2026: shared by every
 * list export; the first copy lived in the customer-card route).
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * The BOM is the whole reason Hebrew survives: without it Excel reads UTF-8 as
 * the system code page. Fields are quoted per RFC 4180 — `לוי, בע"מ` is not
 * exotic.
 */
const BOM = "﻿";

export function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  return BOM + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** The download itself — a dated, ASCII file name (headers cannot carry Hebrew safely). */
export function csvResponse(body: string, name: string): Response {
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
