import type { Area, Role } from "./rbac";

/** Not a Role — a super admin still holds one of the five inside a business. */
export const SUPER_ADMIN_LABEL = "מנהל־על";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "מנהל",
  sales: "מכירות",
  designer: "גרפיקה",
  accounting: "הנהלת חשבונות",
  customer: "לקוח",
};

export const AREA_LABELS: Record<Area, string> = {
  dashboard: "לוח בקרה",
  customers: "לקוחות",
  orders: "הזמנות",
  publications: "פרסומים",
  advertisements: "מודעות וקבצים",
  reminders: "תזכורות",
  issues: "גיליונות ושיבוץ",
  pdf: "הפקת PDF",
  billing: "גבייה ותשלומים",
  reports: "דוחות",
  settings: "הגדרות",
  audit: "לוג ביקורת",
  portal: "פורטל לקוח",
  platform: "ניהול עסקים",
};
