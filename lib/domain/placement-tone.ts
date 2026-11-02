/**
 * The colour an ad wears on the board (the user, 01/11/2026 — from the market
 * survey: every flatplan colours an ad by its state, so a page can be read at a
 * glance). Three colours, the same meaning everywhere on the board:
 * green ready, orange waiting on something, red a real problem.
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 */
export type PlacementTone = "ready" | "attention" | "problem";

export type ToneInput = {
  orderStatus: string | null;
  adStatus: string | null;
  validationStatus: string | null;
  /** An approved second placement of the same publication (FR-16). */
  duplicate: boolean;
  hasPreview: boolean;
};

export function placementTone(input: ToneInput): { tone: PlacementTone; reason: string } {
  if (input.adStatus === "archived") return { tone: "problem", reason: "המודעה בארכיון" };
  if (input.validationStatus && input.validationStatus !== "passed") {
    return { tone: "problem", reason: "הקובץ לא עבר בדיקת תקינות" };
  }
  if (input.orderStatus === "canceled" || input.orderStatus === "rejected") {
    return { tone: "problem", reason: "ההזמנה בוטלה או נדחתה" };
  }
  if (input.orderStatus === "draft" || input.orderStatus === "pending_approval") {
    return { tone: "attention", reason: "ההזמנה עוד לא אושרה" };
  }
  if (input.duplicate) return { tone: "attention", reason: "שיבוץ כפול שאושר" };
  if (!input.hasPreview) return { tone: "attention", reason: "אין תצוגה מקדימה לקובץ" };
  return { tone: "ready", reason: "מוכן לדפוס" };
}

export const TONE_LABELS: Record<PlacementTone, string> = {
  ready: "מוכן",
  attention: "ממתין / חסר משהו",
  problem: "בעיה",
};
