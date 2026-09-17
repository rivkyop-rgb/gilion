/**
 * A business's portal address: /p/<slug> (backlog 21).
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 */

/** Mirrors the CHECK constraint `business_slug_format` in the migration. */
export const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

export function portalPath(slug: string): string {
  return `/p/${slug}`;
}

export function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

export function slugError(slug: string): string | null {
  if (!slug) return "יש להזין כתובת לפורטל";
  if (!SLUG_PATTERN.test(slug)) {
    return "אותיות באנגלית קטנות, ספרות ומקפים בלבד, עד 40 תווים, בלי מקף בהתחלה או בסוף";
  }
  return null;
}

/**
 * The slug a new business starts with.
 *
 * Business names are Hebrew, and a transliteration nobody chose ("hotzaat-
 * hamerkaz" or "hozaat-ha-merkaz"?) is worse than a neutral token the admin
 * replaces with the name they actually use. Random, so two businesses created
 * the same second cannot collide on anything but astronomically bad luck —
 * and the unique index turns even that into an error rather than a mix-up.
 */
export function newBusinessSlug(random: () => number = Math.random): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 8; i++) token += alphabet[Math.floor(random() * alphabet.length)];
  return `paper-${token}`;
}
