import type { Area } from "@/lib/auth/rbac";

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
};

export const NAV_ITEMS: NavItem[] = [
  { area: "dashboard", href: "/dashboard", icon: "LayoutDashboard", stage: 1 },
  { area: "customers", href: "/customers", icon: "Users", stage: 2 },
  { area: "orders", href: "/orders", icon: "ClipboardList", stage: 4 },
  { area: "publications", href: "/publications", icon: "Megaphone", stage: 4 },
  { area: "advertisements", href: "/advertisements", icon: "ImageIcon", stage: 5 },
  // The reminder half of stage 10, brought forward: it needs only Publication
  // and Advertisement, and "the customer never sent artwork" is too common a
  // failure to leave until the last stage. The dashboard half stays at 10.
  { area: "reminders", href: "/reminders", icon: "BellRing", stage: 5 },
  { area: "issues", href: "/issues", icon: "Newspaper", stage: 6 },
  { area: "billing", href: "/billing", icon: "Wallet", stage: 8 },
  { area: "reports", href: "/reports", icon: "BarChart3", stage: 8 },
  { area: "settings", href: "/settings", icon: "Settings", stage: 3 },
  { area: "audit", href: "/audit", icon: "ScrollText", stage: 1 },
  // Super admin only — canRead() returns false for every role, so it reaches
  // the sidebar through the isSuperAdmin branch and no other way.
  { area: "platform", href: "/platform", icon: "Building2", stage: 4 },
];

/** Stages that exist today. Everything above this renders disabled. */
export const BUILT_THROUGH_STAGE = 5;
