/**
 * SVG is code, not a picture (stage 11 §כללי ולידציה).
 *
 * A PNG cannot do anything. An SVG can carry <script>, an `onload=` attribute,
 * a <foreignObject> holding arbitrary HTML, an external <use> that fetches from
 * somewhere else, and a DOCTYPE that expands into gigabytes. Uploading a logo
 * is the one place in this product where a user hands the server a document
 * that a browser will later parse as markup, so it is the one place that has to
 * assume the file is hostile.
 *
 * Two lines of defence, and the second is the one that actually holds:
 *
 *   1. This module strips the active content before the bytes are stored.
 *   2. <BrandMark /> renders the file through <img src=…>, and a browser does
 *      not run script inside an SVG loaded that way — no <object>, no inline
 *      <svg> injection, anywhere in the product.
 *
 * Neither is trusted alone. A regex over markup is a blunt instrument, and it
 * is used here as a filter rather than as a parser: anything it is unsure of,
 * it removes. Stripping something a legitimate logo needed shows up instantly
 * as a logo that looks wrong; missing something hostile shows up never.
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 */

export type SvgScan = {
  /** The bytes to store. Never the input when `removed` is non-empty. */
  svg: string;
  /** Human-readable list of what was taken out, shown to the admin. */
  removed: string[];
};

/** Not an SVG at all, in a way no amount of stripping fixes. */
export type SvgRejection = { error: string };

const PATTERNS: Array<{ re: RegExp; label: string }> = [
  // <script>…</script>, and a <script> whose close tag never arrives.
  { re: /<script\b[\s\S]*?(?:<\/script\s*>|$)/gi, label: "תגיות <script>" },
  // Arbitrary HTML smuggled inside the drawing.
  { re: /<foreignObject\b[\s\S]*?(?:<\/foreignObject\s*>|$)/gi, label: "תגיות <foreignObject>" },
  // Nested browsing contexts and plugin content have no business in a logo.
  { re: /<(iframe|embed|object|audio|video)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, label: "תגיות משובצות" },
  // A DOCTYPE is how entity expansion and external entities get in (XXE).
  { re: /<!DOCTYPE[\s\S]*?>/gi, label: "הצהרת DOCTYPE" },
  { re: /<!ENTITY[\s\S]*?>/gi, label: "הגדרות ENTITY" },
  // Event handlers, in all three attribute quotings. `on` followed by letters
  // covers onload/onerror/onclick and everything a future browser adds.
  { re: /\son[a-z]+\s*=\s*"[^"]*"/gi, label: "מאפייני אירוע (on…)" },
  { re: /\son[a-z]+\s*=\s*'[^']*'/gi, label: "מאפייני אירוע (on…)" },
  { re: /\son[a-z]+\s*=\s*[^\s>]+/gi, label: "מאפייני אירוע (on…)" },
  // javascript: in any attribute — href, xlink:href, or a CSS url().
  { re: /(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/gi, label: "כתובות javascript:" },
  // CSS that executes (legacy IE, but it costs nothing to refuse).
  { re: /expression\s*\(/gi, label: "CSS expression()" },
  // Anything that reaches out to another server while the logo renders.
  {
    re: /\s(?:xlink:href|href|src)\s*=\s*["']\s*https?:\/\/[^"']*["']/gi,
    label: "הפניות חיצוניות",
  },
];

/**
 * Strips every construct above and reports what went.
 *
 * Runs until the input stops changing, because removing one wrapper can reveal
 * another that was hidden inside it — `<scr<script>ipt>` is the classic, and a
 * single pass would hand back a working script tag.
 */
export function sanitizeSvg(source: string): SvgScan | SvgRejection {
  if (!/<svg[\s>]/i.test(source)) {
    return { error: "הקובץ אינו SVG תקין." };
  }

  const removed = new Set<string>();
  let svg = source;

  for (let pass = 0; pass < 5; pass += 1) {
    const before = svg;
    for (const { re, label } of PATTERNS) {
      re.lastIndex = 0;
      if (re.test(svg)) {
        removed.add(label);
        re.lastIndex = 0;
        svg = svg.replace(re, "");
      }
    }
    if (svg === before) break;
  }

  // Stripping can leave something that is no longer a drawing at all.
  if (!/<svg[\s>]/i.test(svg)) {
    return { error: "אחרי הסרת התוכן הפעיל לא נשאר בקובץ ציור. נסי קובץ אחר." };
  }

  return { svg, removed: [...removed] };
}

/** True when the source carries something a browser could execute. */
export function hasActiveContent(source: string): boolean {
  const result = sanitizeSvg(source);
  return "error" in result ? true : result.removed.length > 0;
}
