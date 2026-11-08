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
  update_membership: "שינוי גישת משתמש",
  reset_user_password: "איפוס סיסמה",
  auto_open_issue: "גיליון נפתח אוטומטית (בכניסה למערכת)",
  create_order: "יצירת הזמנה",
  update_order_lines: "עדכון שורות הזמנה",
  submit_order: "שליחה לאישור",
  cancel_order: "ביטול הזמנה",
  create_customer: "יצירת לקוח",
  update_customer: "עדכון פרטי לקוח",
  upload_ad: "העלאת מודעה",
  replace_ad: "החלפת קובץ מודעה",
  archive_ad: "ארכוב מודעה",
  link_ad: "שיוך מודעה לפרסום",
  open_issue: "פתיחת גיליון",
  reopen_issue: "פתיחת גיליון מחדש",
  move_issue_date: "שינוי תאריך גיליון",
  board_sale: "מכירה מלוח השיבוץ",
  move_missed_publication: "העברת פרסום שלא פורסם לתאריך אחר",
  credit_missed_publication: "זיכוי על פרסום שלא פורסם",
  release_credit_block: "שחרור חד־פעמי מחסימת חוב",
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
