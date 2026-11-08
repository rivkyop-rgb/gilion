/**
 * A customer's statement — "דף חשבון" — as a printable A4 page (08/11/2026,
 * the user chose to add it). The customer's accountant asks for exactly this:
 * what was published, what it cost, what came in, and what is left.
 *
 * Pure: everything arrives resolved and already formatted, so the document
 * quotes the screen's own words for money and dates.
 */
import { escapeHtml } from "./print-html";

export type StatementModel = {
  businessName: string;
  businessContact: string | null;
  /** The business's uploaded logo as a `data:` URI, or null to print the name alone. */
  logo?: string | null;
  customerName: string;
  customerTaxId: string | null;
  issuedOn: string;
  rows: Array<{
    date: string;
    newspaper: string;
    shape: string;
    order: string;
    ran: boolean;
    price: string;
    covered: string;
    open: string;
  }>;
  payments: Array<{ date: string; amount: string; invoice: string; order: string }>;
  summary: {
    billed: string;
    settled: string;
    outstanding: string;
    ranOpen: string;
    upcomingOpen: string;
    credit: string | null;
  };
};

/** Numbers and ids in a Hebrew line read in the wrong order without this. */
const ltr = (text: string) => `<span dir="ltr" style="unicode-bidi:isolate">${escapeHtml(text)}</span>`;

export function buildStatementHtml(m: StatementModel): string {
  const rows = m.rows
    .map(
      (r) => `<tr>
  <td>${ltr(r.date)}</td><td>${escapeHtml(r.newspaper)}</td><td>${escapeHtml(r.shape)}</td>
  <td>${ltr(r.order)}</td><td>${r.ran ? "פורסם" : "עתידי"}</td>
  <td class="n">${ltr(r.price)}</td><td class="n">${ltr(r.covered)}</td>
  <td class="n ${r.open !== "" && r.ran ? "due" : ""}">${ltr(r.open)}</td>
</tr>`,
    )
    .join("");
  const payments = m.payments
    .map(
      (p) => `<tr><td>${ltr(p.date)}</td><td class="n">${ltr(p.amount)}</td><td>${ltr(p.invoice)}</td><td>${ltr(p.order)}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 14mm 12mm; }
  html, body { margin: 0; background: #fff; color: #111; }
  body { font-family: "DejaVu Sans", sans-serif; font-size: 10.5px; direction: rtl; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 18px 0 6px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 8px; }
  .muted { color: #555; }
  .logo { display: block; max-height: 18mm; max-width: 55mm; object-fit: contain; margin-block-end: 4px; margin-inline-start: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 4px 5px; text-align: start; border-bottom: 1px solid #ddd; }
  th { background: #f1f1f1; font-weight: 700; }
  .n { text-align: end; white-space: nowrap; }
  .due { color: #b3261e; font-weight: 700; }
  .sum { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
  .box { border: 1px solid #ccc; border-radius: 6px; padding: 6px 8px; }
  .box b { display: block; font-size: 14px; margin-top: 2px; }
  .box.debt { border-color: #b3261e; }
  tr { break-inside: avoid; }
</style>
</head>
<body>
<div class="head">
  <div>
    <h1>דף חשבון</h1>
    <div>${escapeHtml(m.customerName)}${m.customerTaxId ? ` · ח.פ ${ltr(m.customerTaxId)}` : ""}</div>
  </div>
  <div style="text-align:end">
    ${m.logo && m.logo.startsWith("data:image/") ? `<img class="logo" src="${escapeHtml(m.logo)}" alt="">` : ""}
    <div><b>${escapeHtml(m.businessName)}</b></div>
    ${m.businessContact ? `<div class="muted">${escapeHtml(m.businessContact)}</div>` : ""}
    <div class="muted">הופק ב־${ltr(m.issuedOn)}</div>
  </div>
</div>

<div class="sum">
  <div class="box">סך החיובים<b>${ltr(m.summary.billed)}</b></div>
  <div class="box">שולם<b>${ltr(m.summary.settled)}</b></div>
  <div class="box">יתרה פתוחה<b>${ltr(m.summary.outstanding)}</b></div>
  <div class="box debt">מתוכה לתשלום עכשיו (כבר פורסם)<b>${ltr(m.summary.ranOpen)}</b></div>
  <div class="box">מתוכה על פרסומים עתידיים<b>${ltr(m.summary.upcomingOpen)}</b></div>
  ${m.summary.credit ? `<div class="box">זיכוי לטובת הלקוח<b>${ltr(m.summary.credit)}</b></div>` : ""}
</div>

<h2>פרסומים</h2>
${
  m.rows.length === 0
    ? `<p class="muted">אין פרסומים בהזמנות מאושרות.</p>`
    : `<table><thead><tr><th>תאריך</th><th>עיתון</th><th>גודל</th><th>הזמנה</th><th>מצב</th><th class="n">מחיר</th><th class="n">שולם</th><th class="n">פתוח</th></tr></thead><tbody>${rows}</tbody></table>`
}

<h2>תשלומים שהתקבלו</h2>
${
  m.payments.length === 0
    ? `<p class="muted">לא נרשמו תשלומים.</p>`
    : `<table><thead><tr><th>תאריך</th><th class="n">סכום</th><th>חשבונית</th><th>הזמנה</th></tr></thead><tbody>${payments}</tbody></table>`
}

<p class="muted" style="margin-top:14px">תשלום שנרשם על הזמנה מכסה קודם את הפרסומים שכבר יצאו לדפוס, ואחר כך את העתידיים.</p>
</body>
</html>`;
}
