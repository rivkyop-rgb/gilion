/**
 * Counting things in Hebrew.
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * "שובצו 1 פרסומים" is not a sentence. Hebrew agrees the noun AND the verb with
 * the number, and the interesting case is exactly one — which is also the case
 * a developer never sees, because fixtures are built with three of everything.
 * It shipped in five places at once for that reason.
 *
 * Deliberately not an i18n library: the product is Hebrew, one locale, and the
 * whole rule this codebase needs is "one is different". A dependency that also
 * knows about dual, paucal and Welsh would be answering a question nobody here
 * has asked.
 */

/**
 * The counted noun: `פרסום אחד` at one, `3 פרסומים` above it.
 *
 * The singular carries its own "אחד" rather than taking the digit, because
 * "1 פרסום" is what a form field says and not what a person does.
 */
export function counted(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`;
}

/** The verb that goes with it: `שובץ` at one, `שובצו` above it. */
export function agrees(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** `שובץ פרסום אחד` · `שובצו 4 פרסומים` — the phrase the board reports. */
export function placedPhrase(n: number): string {
  return `${agrees(n, "שובץ", "שובצו")} ${counted(n, "פרסום אחד", "פרסומים")}`;
}

/** `עמוד אחד` · `2 עמודים`. */
export function pagesPhrase(n: number): string {
  return counted(n, "עמוד אחד", "עמודים");
}

/** `במיקום אחד` · `ב־12 מיקומים` — where a shape may go on the page. */
export function inPositionsPhrase(n: number): string {
  return n === 1 ? "במיקום אחד" : `ב־${n} מיקומים`;
}

/** `פעולה אחת` · `3 פעולות`. */
export function actionsPhrase(n: number): string {
  return counted(n, "פעולה אחת", "פעולות");
}

/** `פרסום אחד` · `6 פרסומים`. */
export function publicationsPhrase(n: number): string {
  return counted(n, "פרסום אחד", "פרסומים");
}
