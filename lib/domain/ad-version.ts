/**
 * The one-previous-version rule (US-005 AC-3, AC-5).
 *
 * Pure: it takes the three keys an advertisement holds and returns the three
 * it should hold after a replacement or a revert. Keeping it here rather than
 * inline in the Server Action is what lets "a third replacement still does not
 * touch the original" be a test instead of a hope.
 */

export type AdFileKeys = {
  /** The live file. */
  fileUrl: string;
  /** The first upload. Never written again after creation. */
  originalFileUrl: string;
  /** Exactly one step of history, or none. */
  previousFileUrl: string | null;
};

/**
 * Replacing the live file.
 *
 * The current live key becomes the previous one, and whatever WAS previous is
 * dropped — that is the "one previous version only" of AC-5, and it is why a
 * third replacement leaves the first replacement unreachable while the
 * original is still exactly where it started.
 */
export function afterReplace(keys: AdFileKeys, newKey: string): AdFileKeys {
  return {
    fileUrl: newKey,
    originalFileUrl: keys.originalFileUrl,
    previousFileUrl: keys.fileUrl,
  };
}

/** Which stored object a replacement orphans, if any — the caller deletes it. */
export function orphanedByReplace(keys: AdFileKeys): string | null {
  const dropped = keys.previousFileUrl;
  if (!dropped) return null;
  // Never delete the original, even when it happens to be the previous key —
  // which it is after exactly one replacement (AC-3 outranks tidiness).
  if (dropped === keys.originalFileUrl || dropped === keys.fileUrl) return null;
  return dropped;
}

export class NothingToRevertError extends Error {
  constructor() {
    super("אין גרסה קודמת לשחזור");
    this.name = "NothingToRevertError";
  }
}

/**
 * Reverting swaps live and previous, so the revert is itself revertible — the
 * user who restored by mistake gets one step back, and no more.
 */
export function afterRevert(keys: AdFileKeys): AdFileKeys {
  if (!keys.previousFileUrl) throw new NothingToRevertError();
  return {
    fileUrl: keys.previousFileUrl,
    originalFileUrl: keys.originalFileUrl,
    previousFileUrl: keys.fileUrl,
  };
}

export function canRevert(keys: Pick<AdFileKeys, "previousFileUrl">): boolean {
  return keys.previousFileUrl !== null;
}
