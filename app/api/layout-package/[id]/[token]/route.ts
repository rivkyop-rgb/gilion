/**
 * The designer's page for one issue (03/11/2026): every ad to lay out, its
 * page or requested place, its size and the note — with each file and the
 * whole ZIP one click away.
 *
 * Public on purpose, like the tear-sheet link: a designer outside the office
 * has no account. The signature is the whole gate, checked before anything is
 * read, and a wrong link is a 404.
 *
 * Plain HTML from a Route Handler: no app shell, nothing to sign in to, and it
 * prints cleanly as the job sheet it is.
 */
import { NextResponse } from "next/server";

import { verifyLayoutPackageToken } from "@/lib/layout-package-token";
import { businessOfIssue, layoutPackage } from "@/lib/data/layout-package";

export const dynamic = "force-dynamic";

const DAY = new Intl.DateTimeFormat("he-IL", { dateStyle: "full", timeZone: "Asia/Jerusalem" });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; token: string }> },
) {
  const { id, token } = await params;
  if (!verifyLayoutPackageToken(id, token)) return new NextResponse("not found", { status: 404 });
  const businessId = await businessOfIssue(id);
  if (!businessId) return new NextResponse("not found", { status: 404 });
  const pkg = await layoutPackage(businessId, id);
  if (!pkg) return new NextResponse("not found", { status: 404 });

  const base = new URL(request.url).pathname.replace(/\/$/, "");
  const rows = pkg.items
    .map(
      (i) => `<tr>
  <td class="page">${i.pageNumber ?? "—"}</td>
  <td>${i.file?.previewUrl ? `<img src="${base}/preview-${i.publicationId}" alt="">` : ""}</td>
  <td><strong>${esc(i.customerName)}</strong><br><span class="muted">${esc(i.shapeName)} · ${esc(i.size)}</span></td>
  <td>${esc(i.position ?? "")}${i.note ? `<div class="note">${esc(i.note)}</div>` : ""}</td>
  <td>${i.file ? `<a href="${base}/${i.publicationId}">הורדה</a>` : `<span class="missing">חסר קובץ</span>`}</td>
</tr>`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(pkg.newspaperName)} — קבצים לשיבוץ</title>
<style>
body{font-family:system-ui,"Segoe UI",Arial,sans-serif;margin:0;background:#f4f5f8;color:#1b1f2a}
main{max-width:960px;margin:0 auto;padding:24px}
h1{margin:0 0 4px;font-size:24px}.muted{color:#5b6274;font-size:13px}
.bar{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:16px 0}
.btn{background:#14213d;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px #0002}
th,td{padding:10px 12px;text-align:start;border-top:1px solid #e6e8ee;vertical-align:middle;font-size:14px}
th{background:#eef0f5;border-top:0}td.page{font-size:20px;font-weight:700;text-align:center}
img{width:56px;height:56px;object-fit:contain;background:#f4f5f8;border-radius:6px}
.note{margin-top:4px;background:#fff6dd;color:#7a5200;padding:2px 8px;border-radius:6px;display:inline-block}
.missing{color:#a3261c}@media print{.btn{display:none}body{background:#fff}}
</style></head><body><main>
<h1>${esc(pkg.newspaperName)}</h1>
<div class="muted">${esc(DAY.format(pkg.date))} · ${pkg.totalPages} עמודים · ${pkg.items.length} מודעות</div>
<div class="bar"><span class="muted">מסודר לפי עמוד. "מיקום מבוקש" הוא מה שהלקוח ביקש; ההערה היא למשבץ.</span>
<a class="btn" href="${base}/zip">הורדת כל הקבצים (ZIP)</a></div>
<table><thead><tr><th>עמוד</th><th></th><th>לקוח וגודל</th><th>מיקום מבוקש והערה</th><th>קובץ</th></tr></thead>
<tbody>${rows}</tbody></table>
</main></body></html>`;

  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" },
  });
}

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
