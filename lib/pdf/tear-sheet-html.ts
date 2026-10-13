/**
 * A tear sheet: the printed page as an image, a frame around the customer's
 * ad, and — when the newspaper wants it — a caption saying which paper, which
 * day and which page (the user, 14/10/2026).
 *
 * Pure: everything arrives resolved. The page image is a raster of the FINAL
 * PDF, i.e. what actually went to print, not a re-render of today's data — a
 * replaced artwork file must not rewrite a proof of what was published.
 */
import { escapeHtml } from "./print-html";

export type TearSheetModel = {
  /** PNG of the printed page, as a data: URI. */
  pageImage: string;
  /** The ad's box, in percent of the page. */
  frame: { leftPct: number; topPct: number; widthPct: number; heightPct: number };
  /** Null → no caption band. */
  caption: string | null;
};

export function buildTearSheetHtml(model: TearSheetModel): string {
  const { frame } = model;
  const pct = (n: number) => `${Number(n.toFixed(4))}%`;
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "DejaVu Sans", sans-serif; }
  .caption {
    padding: 14px 20px;
    font-size: 22px;
    font-weight: 700;
    color: #111;
    border-bottom: 3px solid #111;
    direction: rtl;
  }
  .sheet { position: relative; }
  .sheet img { display: block; width: 100%; height: auto; }
  .frame {
    position: absolute;
    box-sizing: border-box;
    border: 5px solid #d4202c;
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.9);
  }
</style>
</head>
<body>
${model.caption ? `<div class="caption">${escapeHtml(model.caption)}</div>` : ""}
<div class="sheet">
<img src="${model.pageImage}" alt="">
<div class="frame" style="left:${pct(frame.leftPct)};top:${pct(frame.topPct)};width:${pct(frame.widthPct)};height:${pct(frame.heightPct)}"></div>
</div>
</body>
</html>`;
}
