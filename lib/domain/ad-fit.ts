/**
 * Does the artwork have the shape of the space it was sold for (12/10/2026)?
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * Only the RATIO is compared. Size is not the question: a PDF at 150 mm and
 * one at 300 mm both print into a 100 mm box, scaled. What does not survive
 * the box is the wrong shape — a portrait file in a landscape strip prints as
 * a thin column with empty sides, or is cropped, and nobody notices until the
 * paper is out.
 *
 * A warning, never a refusal (the user's choice): a slightly-off file is
 * common, sometimes intentional, and the designer is the one who decides.
 */
export const RATIO_TOLERANCE = 0.1;

export type AdFit = {
  /** Width ÷ height of the file. */
  fileRatio: number;
  /** Width ÷ height of the printed space. */
  spaceRatio: number;
  /** "portrait" / "landscape" / "square" — what a person calls each one. */
  file: Orientation;
  space: Orientation;
};

type Orientation = "portrait" | "landscape" | "square";

function orientation(ratio: number): Orientation {
  if (ratio > 1 + RATIO_TOLERANCE) return "landscape";
  if (ratio < 1 - RATIO_TOLERANCE) return "portrait";
  return "square";
}

/**
 * Null when it fits, or when there is nothing to compare (a file uploaded
 * before its proportions were recorded). Compared on a log scale, so "twice
 * as wide" and "twice as tall" are the same distance from a match.
 */
export function adFitProblem(
  file: { width: number | null; height: number | null },
  space: { widthMm: number; heightMm: number },
  tolerance = RATIO_TOLERANCE,
): AdFit | null {
  if (!file.width || !file.height || space.widthMm <= 0 || space.heightMm <= 0) return null;
  const fileRatio = file.width / file.height;
  const spaceRatio = space.widthMm / space.heightMm;
  if (Math.abs(Math.log(fileRatio / spaceRatio)) <= Math.log(1 + tolerance)) return null;
  return { fileRatio, spaceRatio, file: orientation(fileRatio), space: orientation(spaceRatio) };
}

const WORD: Record<Orientation, string> = {
  portrait: "לאורך",
  landscape: "לרוחב",
  square: "ריבועי",
};

/** The sentence a person reads under the thumbnail. */
export function adFitMessage(fit: AdFit, shapeName: string): string {
  const ratio = (r: number) => (r >= 1 ? `${r.toFixed(2)}:1` : `1:${(1 / r).toFixed(2)}`);
  if (fit.file !== fit.space) {
    return `הקובץ ${WORD[fit.file]} והשטח (${shapeName}) ${WORD[fit.space]} — המודעה תודפס מוקטנת עם שוליים ריקים, או חתוכה.`;
  }
  return `יחס הקובץ (${ratio(fit.fileRatio)}) שונה מיחס השטח ${shapeName} (${ratio(fit.spaceRatio)}) — כדאי לבדוק לפני הדפוס.`;
}
