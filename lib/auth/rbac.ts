/**
 * Role-based access control (FR-8, FR-9).
 *
 * The matrix below is a direct transcription of the table in
 * docs/plan/01-auth-multitenancy.md. It is the single source of truth: the
 * sidebar, the route guards and the Vitest suite all read from it, so a role
 * can never be allowed in the menu but blocked in the server (or worse, the
 * reverse). Adding an area here forces every consumer to handle it.
 *
 * Pure module: no Prisma, no React (conventions.md §9).
 */

export const ROLES = ["admin", "sales", "designer", "accounting", "customer"] as const;
export type Role = (typeof ROLES)[number];

export const AREAS = [
  "dashboard",
  "customers",
  "orders",
  "publications",
  "advertisements",
  "reminders",
  "issues",
  "pdf",
  "billing",
  "reports",
  "settings",
  "audit",
  "portal",
  /**
   * Creating businesses and appointing their admins. Closed to all five roles
   * without exception — it is not a thing one does inside a business, it is
   * what brings a business into being. Only a super admin reaches it, and the
   * gate is `canAccessPlatform`, never the matrix.
   */
  "platform",
] as const;
export type Area = (typeof AREAS)[number];

/** none = no access at all · read = may view · write = may view and change */
export type Access = "none" | "read" | "write";

const MATRIX: Record<Area, Record<Role, Access>> = {
  dashboard: {
    admin: "write",
    sales: "write",
    designer: "write",
    accounting: "write",
    customer: "none",
  },
  customers: {
    admin: "write",
    sales: "write",
    designer: "read",
    accounting: "read",
    customer: "none",
  },
  orders: {
    admin: "write",
    sales: "write",
    designer: "none",
    accounting: "read",
    customer: "none",
  },
  // A designer places publications, so they must see them — but the orders that
  // created them, and the money on them, stay out of reach (stage 04 §הרשאות).
  publications: {
    admin: "write",
    sales: "write",
    designer: "read",
    accounting: "read",
    customer: "none",
  },
  advertisements: {
    admin: "write",
    sales: "write",
    designer: "write",
    accounting: "none",
    customer: "none",
  },
  /**
   * Chasing customers for artwork (FR-11).
   *
   * Its own area rather than a corner of `publications`, because the audience
   * differs: a designer needs to SEE who has not sent a file — it is what
   * their day depends on — but chasing the customer is not their job, and
   * accounting has no part in it at all.
   */
  reminders: {
    admin: "write",
    sales: "write",
    designer: "read",
    accounting: "none",
    customer: "none",
  },
  issues: {
    admin: "write",
    sales: "read",
    designer: "write",
    accounting: "none",
    customer: "none",
  },
  pdf: { admin: "write", sales: "none", designer: "write", accounting: "none", customer: "none" },
  // FR-8: designer must not see payment data anywhere — not in the menu, not in
  // a table column, not in an API response.
  billing: {
    admin: "write",
    sales: "none",
    designer: "none",
    accounting: "write",
    customer: "none",
  },
  reports: {
    admin: "write",
    sales: "read",
    designer: "none",
    accounting: "write",
    customer: "none",
  },
  settings: {
    admin: "write",
    sales: "none",
    designer: "none",
    accounting: "none",
    customer: "none",
  },
  audit: { admin: "write", sales: "none", designer: "none", accounting: "none", customer: "none" },
  // FR-9: the customer portal is the only place a customer may reach, and no
  // internal role may reach it.
  portal: { admin: "none", sales: "none", designer: "none", accounting: "none", customer: "write" },
  // Every entry is "none" on purpose, and that is the whole point: no role,
  // admin included, gets here by being a role.
  platform: {
    admin: "none",
    sales: "none",
    designer: "none",
    accounting: "none",
    customer: "none",
  },
};

export function access(role: Role, area: Area): Access {
  return MATRIX[area][role];
}

export function canRead(role: Role, area: Area): boolean {
  return access(role, area) !== "none";
}

export function canWrite(role: Role, area: Area): boolean {
  return access(role, area) === "write";
}

/**
 * Areas a role may see at all — what the sidebar renders.
 *
 * A super admin sees everything a business admin sees, plus the platform area.
 * Being a super admin does not change what `role` means inside a business; it
 * adds one area and the right to be in any business at all.
 */
export function readableAreas(role: Role, isSuperAdmin = false): Area[] {
  const areas = AREAS.filter((a) => canRead(role, a));
  return isSuperAdmin && !areas.includes("platform") ? [...areas, "platform"] : areas;
}

/** The platform area has exactly one key, and it is not a role. */
export function canAccessPlatform(isSuperAdmin: boolean): boolean {
  return isSuperAdmin === true;
}

export class NotSuperAdminError extends Error {
  readonly digest = FORBIDDEN_DIGEST;

  constructor() {
    super("platform administration requires a super admin");
    this.name = "ForbiddenError";
  }
}

/** Server-side guard for every platform screen and action. */
export function requireSuperAdmin(isSuperAdmin: boolean): void {
  if (!canAccessPlatform(isSuperAdmin)) throw new NotSuperAdminError();
}

/**
 * The marker the error boundary matches on.
 *
 * A production build does NOT send `name` or `message` across the server/client
 * boundary — Next replaces both with a generic string so a server error cannot
 * leak internals to a browser. `digest` is the one field it forwards verbatim,
 * which is how `notFound()` and `redirect()` survive the same trip.
 *
 * Setting it here rather than letting Next hash the message is what makes the
 * match stable: Next's own digest is derived from the text, so it differs per
 * role and area, and would change the moment the wording did.
 */
export const FORBIDDEN_DIGEST = "GILION_FORBIDDEN";

export class ForbiddenError extends Error {
  /** Read by app/(internal)/error.tsx — see FORBIDDEN_DIGEST. */
  readonly digest = FORBIDDEN_DIGEST;

  constructor(
    readonly role: Role,
    readonly area: Area,
    readonly needed: Access,
  ) {
    super(`role "${role}" lacks ${needed} access to "${area}"`);
    this.name = "ForbiddenError";
  }
}

/**
 * Throws unless the role has at least the required access. Server-side guard.
 *
 * A super admin passes everywhere, because inside a business they act as its
 * admin — the flag is checked here rather than by rewriting `role` at the
 * session layer, so the audit log keeps recording the role the person actually
 * holds instead of a role they were silently granted.
 */
export function requireAccess(
  role: Role,
  area: Area,
  needed: "read" | "write" = "read",
  isSuperAdmin = false,
): void {
  if (area === "platform") {
    requireSuperAdmin(isSuperAdmin);
    return;
  }
  if (isSuperAdmin) return;
  const has = access(role, area);
  if (has === "none" || (needed === "write" && has === "read")) {
    throw new ForbiddenError(role, area, needed);
  }
}
