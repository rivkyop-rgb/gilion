/**
 * The audit trail in words. Portal actions are named as actions, not as a
 * verb with a gender — the customer's name sits next to them (CLAUDE.md).
 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  approve_order: "אישור הזמנה",
  reject_order: "דחיית הזמנה",
  delete_order: "מחיקת הזמנה",
  deactivate_business: "השבתת עסק",
  activate_business: "הפעלת עסק",
  update_role_permissions: "שינוי הרשאות",
  delete_customer: "מחיקת לקוח",
  cancel_publication: "ביטול פרסום",
  close_issue: "סגירת גיליון",
  generate_pdf: "הפקת PDF",
  update_payment: "עדכון תשלום",
  override_duplicate_placement: "אישור שיבוץ כפול",
  update_business_settings: "שינוי הגדרות",
  portal_sign_in: "כניסה לפורטל",
  portal_submit_request: "בקשת פרסום מהפורטל",
  portal_upload_ad: "העלאת מודעה מהפורטל",
  portal_cancel_request: "ביטול בקשה בפורטל",
};

export const PORTAL_AUDIT_ACTIONS = [
  "portal_sign_in",
  "portal_submit_request",
  "portal_upload_ad",
  "portal_cancel_request",
] as const;

export const auditActionLabel = (action: string) => AUDIT_ACTION_LABELS[action] ?? action;
