/**
 * Linking an advertisement to a publication (US-005 AC-4, FR-5, rules 4–6, 10).
 *
 * Pure. The state transition itself belongs to publication-status.ts; what
 * lives here is whether the link is allowed to happen at all, and the Hebrew
 * that explains a refusal.
 */
import type { PublicationStatus } from "./publication-status";

export type LinkableAd = {
  id: string;
  customerId: string | null;
  validationPassed: boolean;
  archived: boolean;
};

export type LinkTargetPublication = {
  id: string;
  customerId: string;
  status: PublicationStatus;
};

/**
 * The states a publication may receive an ad in.
 *
 * `ad_received` and `ready_for_layout` are absent on purpose: swapping the ad
 * on a publication that already has one is an unlink followed by a link, not a
 * second link, so the state machine stays the only door.
 */
export const LINKABLE_STATUSES: readonly PublicationStatus[] = ["planned", "missing_ad"];

/**
 * Placeable = passed validation AND belongs to a customer (US-005 AC-2, AC-4).
 *
 * This is the server-side half of the "ללא לקוח" badge. The badge explains;
 * this refuses. Stage 06 calls the same function before a placement.
 */
export function isPlaceable(ad: LinkableAd): boolean {
  return ad.validationPassed && ad.customerId !== null && !ad.archived;
}

export type LinkRefusal = { message: string };

export function refuseLink(ad: LinkableAd, publication: LinkTargetPublication): LinkRefusal | null {
  if (ad.archived) return { message: "המודעה בארכיון ואינה זמינה לשיוך" };
  if (!ad.validationPassed) {
    return { message: "המודעה לא עברה בדיקת תקינות ואינה זמינה לשיבוץ" };
  }
  if (!ad.customerId) {
    return { message: "המודעה אינה משויכת ללקוח ולכן אינה זמינה לשיבוץ" };
  }
  if (ad.customerId !== publication.customerId) {
    return { message: "המודעה שייכת ללקוח אחר מזה של הפרסום" };
  }
  if (!LINKABLE_STATUSES.includes(publication.status)) {
    return { message: "לפרסום הזה כבר משויכת מודעה, או שהוא אינו במצב שמאפשר שיוך" };
  }
  return null;
}

/** What the ad-detail panel and the link modal both need to know about an ad. */
export function placeabilityNote(ad: LinkableAd): string | null {
  if (ad.archived) return "המודעה בארכיון";
  if (!ad.validationPassed) return "הקובץ לא עבר בדיקת תקינות ואינו זמין לשיבוץ";
  if (!ad.customerId) return "מודעה ללא לקוח אינה זמינה לשיבוץ";
  return null;
}
