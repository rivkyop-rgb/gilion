/**
 * The brand colours an admin may override at runtime (stage 11).
 *
 * The whole mechanism is one line of CSS, written once in app/globals.css:
 * every token is declared `var(--gilion-<name>, <default>)`. Setting
 * `--gilion-primary` on an element that wraps the app therefore repaints the
 * system, and setting nothing falls back to the default with no conditional
 * anywhere. There is no rebuild and no deploy — which is the entire point of
 * the stage.
 *
 * This module is the ONE place a colour literal is allowed to live. Everything
 * else reads a token. An ESLint rule enforces that, because a hex code typed
 * into a component is a colour the admin panel cannot reach, and it looks like
 * every other colour until the day someone changes the brand and one badge
 * stays the old blue.
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 */

/** A group exists so the screen can lay the tokens out; it carries no logic. */
export type TokenGroup = "brand" | "status";

export type ThemeToken = {
  /** The `--gilion-` suffix, and the key stored in `color_overrides`. */
  key: string;
  label: string;
  group: TokenGroup;
  /** The value in globals.css. Kept here too so the panel can show and reset it. */
  default: string;
  /**
   * The token this one is read ON TOP of, when there is one. Contrast is only
   * a meaningful question for a pair, and the pair is not derivable from the
   * name: `on-primary` sits on `primary`, but `status-success-fg` sits on
   * `status-success-bg` and not on the page.
   */
  over?: string;
};

/**
 * Fifteen tokens, and deliberately not "every colour in globals.css".
 *
 * The surfaces are a nine-step light-blue ramp that only works as a ramp —
 * handing an admin nine adjacent near-whites produces a broken hierarchy far
 * more often than a brand. What is here is what a business actually asks to
 * change: its own colour, its gold, and the five states a person reads off a
 * badge without reading the word.
 */
export const THEME_TOKENS: readonly ThemeToken[] = [
  { key: "primary", label: "צבע ראשי", group: "brand", default: "#000613" },
  {
    key: "on-primary",
    label: "טקסט על הצבע הראשי",
    group: "brand",
    default: "#ffffff",
    over: "primary",
  },
  { key: "primary-container", label: "צבע ראשי בהיר", group: "brand", default: "#001f3f" },
  { key: "brand-gold", label: "זהב המותג", group: "brand", default: "#d4af37" },
  { key: "state-active", label: "הדגשת פריט פעיל בתפריט", group: "brand", default: "#fed65b" },

  { key: "status-success-bg", label: "רקע — הצלחה", group: "status", default: "#e6f4ea" },
  {
    key: "status-success-fg",
    label: "טקסט — הצלחה",
    group: "status",
    default: "#137333",
    over: "status-success-bg",
  },
  { key: "status-warning-bg", label: "רקע — אזהרה", group: "status", default: "#fff3e0" },
  /**
   * Was #e65100 until the contrast check at the bottom of this file was written
   * and failed on it the same minute: 3.46:1 against its own background, under
   * the 4.5:1 that same check warns every admin about. Darkened to the nearest
   * value in the same hue that clears AA (4.68:1). A palette that ships a
   * warning it would itself warn about teaches people to dismiss the warning.
   */
  {
    key: "status-warning-fg",
    label: "טקסט — אזהרה",
    group: "status",
    default: "#bf4600",
    over: "status-warning-bg",
  },
  { key: "status-error-bg", label: "רקע — שגיאה", group: "status", default: "#ffdad6" },
  {
    key: "status-error-fg",
    label: "טקסט — שגיאה",
    group: "status",
    default: "#93000a",
    over: "status-error-bg",
  },
  { key: "status-debt-bg", label: "רקע — חוב", group: "status", default: "#fed65b" },
  {
    key: "status-debt-fg",
    label: "טקסט — חוב",
    group: "status",
    default: "#745c00",
    over: "status-debt-bg",
  },
  { key: "status-neutral-bg", label: "רקע — ניטרלי", group: "status", default: "#d8e3fa" },
  {
    key: "status-neutral-fg",
    label: "טקסט — ניטרלי",
    group: "status",
    default: "#43474e",
    over: "status-neutral-bg",
  },
] as const;

export const TOKEN_KEYS: readonly string[] = THEME_TOKENS.map((t) => t.key);

export function tokenByKey(key: string): ThemeToken | undefined {
  return THEME_TOKENS.find((t) => t.key === key);
}

/** What the database stores: a sparse key→hex map. A missing key is "default". */
export type ColorOverrides = Record<string, string>;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isValidHex(value: string): boolean {
  return HEX.test(value.trim());
}

/** `#abc` → `#aabbcc`. Stored expanded so every consumer compares like for like. */
export function normalizeHex(value: string): string {
  const v = value.trim().toLowerCase();
  if (v.length !== 4) return v;
  const [, r, g, b] = v;
  return `#${r}${r}${g}${g}${b}${b}`;
}

/**
 * Reads a submitted map and keeps only what is worth storing.
 *
 * A value equal to the default is DROPPED rather than written — the same rule
 * as the permission matrix, and for the same reason: storing it would freeze
 * today's default into this business forever, so a later correction to the
 * palette would silently skip every business that once opened this screen and
 * pressed save. An unknown key is dropped too, so a stale form cannot write a
 * token that no longer exists.
 */
export function readSubmittedColors(
  submitted: Record<string, string>,
): { overrides: ColorOverrides } | { error: string } {
  const overrides: ColorOverrides = {};

  for (const [key, raw] of Object.entries(submitted)) {
    const token = tokenByKey(key);
    if (!token) continue;

    const value = raw.trim();
    if (value === "") continue; // an empty field means "leave it at the default"

    if (!isValidHex(value)) {
      return { error: `"${token.label}" — ${value} אינו קוד צבע תקין. הפורמט הוא ‎#rrggbb‎.` };
    }

    const hex = normalizeHex(value);
    if (hex !== normalizeHex(token.default)) overrides[key] = hex;
  }

  return { overrides };
}

/** The effective palette: overrides on top of the defaults, every key present. */
export function mergeTokens(overrides: ColorOverrides = {}): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const token of THEME_TOKENS) {
    const override = overrides[token.key];
    merged[token.key] =
      override && isValidHex(override) ? normalizeHex(override) : normalizeHex(token.default);
  }
  return merged;
}

/**
 * The `style` object the layout puts on the element that wraps the app.
 *
 * Only the overridden keys are emitted. Writing all fifteen would work, but it
 * would also mean every page carries the defaults inline — so a change to
 * globals.css would stop reaching any business that had ever saved.
 */
export function cssVariables(overrides: ColorOverrides = {}): Record<string, string> {
  const style: Record<string, string> = {};
  for (const token of THEME_TOKENS) {
    const value = overrides[token.key];
    if (value && isValidHex(value)) style[`--gilion-${token.key}`] = normalizeHex(value);
  }
  return style;
}

/* ------------------------------------------------------------------ contrast */

/** sRGB relative luminance, WCAG 2.1 §relative luminance. */
export function luminance(hex: string): number {
  const v = normalizeHex(hex);
  const channel = (pair: string) => {
    const c = parseInt(pair, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(v.slice(1, 3));
  const g = channel(v.slice(3, 5));
  const b = channel(v.slice(5, 7));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. Order of arguments does not matter. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const WCAG_AA = 4.5;

export type ContrastWarning = { key: string; over: string; ratio: number; message: string };

/**
 * Pairs that fall below AA, as WARNINGS.
 *
 * Deliberately not blocking (stage 11 §כללי ולידציה): it is the admin's own
 * business and their own brand, and a system that refuses a colour a customer
 * chose is a system they will work around. But an unreadable badge is not
 * something anyone picks on purpose, so it has to be said out loud at the
 * moment of choosing — which is the difference between a warning and silence.
 */
export function contrastWarnings(overrides: ColorOverrides = {}): ContrastWarning[] {
  const merged = mergeTokens(overrides);
  const warnings: ContrastWarning[] = [];

  for (const token of THEME_TOKENS) {
    if (!token.over) continue;
    const fg = merged[token.key];
    const bg = merged[token.over];
    if (!fg || !bg) continue;

    const ratio = contrastRatio(fg, bg);
    if (ratio >= WCAG_AA) continue;

    warnings.push({
      key: token.key,
      over: token.over,
      ratio,
      message: `"${token.label}" על "${tokenByKey(token.over)?.label ?? token.over}" — יחס ניגודיות ${ratio.toFixed(1)}:1, מתחת ל־${WCAG_AA}:1 של WCAG AA. הטקסט עלול להיות קשה לקריאה.`,
    });
  }

  return warnings;
}
