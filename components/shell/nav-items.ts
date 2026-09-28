import type { Area } from "@/lib/auth/rbac";

/**
 * The three groups the menu is read in (redesign, 29/09/2026). The order is
 * the order of a working day: what has to go out today, then the money, then
 * the settings nobody opens daily.
 */
export type NavGroup = "daily" | "sales" | "admin";

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  daily: "עבודה יומית",
  sales: "מכירות וכסף",
  admin: "ניהול",
};

/**
 * The sidebar, derived from the RBAC areas. `stage` records which build stage
 * delivers the screen: anything not yet built renders disabled rather than
 * being hidden, so the shape of the product is visible from day one.
 */
export type NavItem = {
  area: Area;
  href: string;
  icon: string;
  stage: number;
  group: NavGroup;
};

export const NAV_ITEMS: NavItem[] = [
  { area: "dashboard", href: "/dashboard", icon: "LayoutDashboard", stage: 1, group: "daily" },
  { area: "issues", href: "/issues", icon: "Newspaper", stage: 6, group: "daily" },
  { area: "publications", href: "/publications", icon: "Megaphone", stage: 4, group: "daily" },
  { area: "advertisements", href: "/advertisements", icon: "ImageIcon", stage: 5, group: "daily" },
  // The reminder half of stage 10, brought forward: it needs only Publication
  // and Advertisement, and "the customer never sent artwork" is too common a
  // failure to leave until the last stage. The dashboard half stays at 10.
  { area: "reminders", href: "/reminders", icon: "BellRing", stage: 5, group: "daily" },
  { area: "customers", href: "/customers", icon: "Users", stage: 2, group: "sales" },
  { area: "orders", href: "/orders", icon: "ClipboardList", stage: 4, group: "sales" },
  { area: "billing", href: "/billing", icon: "Wallet", stage: 8, group: "sales" },
  { area: "reports", href: "/reports", icon: "BarChart3", stage: 8, group: "sales" },
  { area: "settings", href: "/settings", icon: "Settings", stage: 3, group: "admin" },
  { area: "audit", href: "/audit", icon: "ScrollText", stage: 1, group: "admin" },
  // Super admin only — canRead() returns false for every role, so it reaches
  // the sidebar through the isSuperAdmin branch and no other way.
  { area: "platform", href: "/platform", icon: "Building2", stage: 4, group: "admin" },
];

/** Stages that exist today. Everything above this renders disabled. */
export const BUILT_THROUGH_STAGE = 8;
