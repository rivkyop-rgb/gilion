/**
 * What a customer sees from the "your file does not fit" message (03/11/2026):
 * their own file drawn inside the space they bought — the empty margins say
 * more than any sentence — and, when another size fits it, the same file in
 * that size with its price.
 *
 * Public on purpose, like the tear-sheet and designer links: the customer has
 * no account. The signature is the whole gate, checked before anything is
 * read, and a wrong link is a 404.
 */
import { NextResponse } from "next/server";

import { verifyAdViewToken } from "@/lib/ad-view-token";
import { adViewOf } from "@/lib/data/misfit-publications";
import { priceDeltaPhrase, sizeCm } from "@/lib/domain/customer-messages";

export const dynamic = "force-dynamic";

const DAY = new Intl.DateTimeFormat("he-IL", { dateStyle: "full", timeZone: "Asia/Jerusalem" });
const BOX = 300;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; token: string }> },
) {
  const { id, token } = await params;
  if (!verifyAdViewToken(id, token)) return new NextResponse("not found", { status: 404 });
  const view = await adViewOf(id);
  if (!view) return new NextResponse("not found", { status: 404 });

  const base = new URL(request.url).pathname.replace(/\/$/, "");
  const image = view.ad.previewKey ? `${base}/preview` : null;

  const rec = view.recommended;
  // One scale for both, so a quarter page looks a quarter of a page beside it.
  const largest = Math.max(
    view.ordered.widthMm,
    view.ordered.heightMm,
    rec?.widthMm ?? 0,
    rec?.heightMm ?? 0,
  );
  const scale = BOX / largest;
  const space = (s: { widthMm: number; heightMm: number }, caption: string, note: string) => {
    const w = Math.round(s.widthMm * scale);
    const h = Math.round(s.heightMm * scale);
    return `<figure>
  <div class="space" style="width:${w}px;height:${h}px">${image ? `<img src="${image}" alt="">` : ""}</div>
  <figcaption><strong>${esc(caption)}</strong><br><span class="muted">${esc(note)}</span></figcaption>
</figure>`;
  };

  const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>המודעה שלך — ${esc(view.newspaperName)}</title>
<style>
body{font-family:system-ui,"Segoe UI",Arial,sans-serif;margin:0;background:#f4f5f8;color:#1b1f2a}
main{max-width:760px;margin:0 auto;padding:24px}
h1{margin:0 0 4px;font-size:22px}.muted{color:#5b6274;font-size:13px}
.row{display:flex;gap:32px;flex-wrap:wrap;align-items:flex-end;margin:24px 0}
figure{margin:0}figcaption{margin-top:8px;font-size:14px}
.space{border:2px dashed #14213d;background:repeating-linear-gradient(45deg,#fff,#fff 8px,#eef0f5 8px,#eef0f5 16px);display:flex;align-items:center;justify-content:center;overflow:hidden}
.space img{max-width:100%;max-height:100%;object-fit:contain;display:block}
.box{background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 3px #0002;font-size:15px;line-height:1.6}
.bad{color:#a3261c}.ok{color:#1d6b3a}
.btn{display:inline-block;margin-top:16px;background:#14213d;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600}
</style></head><body><main>
<h1>${esc(view.customerName)}</h1>
<div class="muted">${esc(view.newspaperName)} · ${esc(DAY.format(view.date))}</div>
<div class="row">
${space(view.ordered, `השטח שהוזמן: ${view.shapeName}`, sizeCm(view.ordered))}
${rec ? space(rec, `גודל שמתאים לקובץ: ${rec.name}`, `${sizeCm(rec)} · ${priceDeltaPhrase(view.price, rec.price ?? view.price)}`) : ""}
</div>
<div class="box">
${
  view.fits
    ? `<p class="ok">הקובץ מתאים לשטח שהוזמן.</p>`
    : `<p class="bad">הקובץ בפרופורציה אחרת מהשטח שהוזמן, ולכן הוא ייצא מוקטן עם שוליים ריקים (האזור המקווקו), או חתוך.</p>
<p>אפשר לשלוח קובץ חדש במידות <strong>${esc(sizeCm(view.ordered))}</strong>${
        rec ? `, או לבקש לשנות את ההזמנה ל<strong>${esc(rec.name)}</strong>` : ""
      }.</p>`
}
${view.ad.fileKey ? `<a class="btn" href="${base}/file">הורדת הקובץ ששלחת</a>` : ""}
</div>
</main></body></html>`;

  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" },
  });
}

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
