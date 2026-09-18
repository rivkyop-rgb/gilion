/**
 * A customer's login to the portal (stage 09: "Admin מקשר משתמש ללקוח").
 *
 * There is no self-registration (09-customer-portal.md §Scope), so the only way
 * an advertiser gets in is an admin creating the account from the customer's
 * card. The rules for name, email and password are the staff rules — one set of
 * rules for "a person who can sign in" — without a role to choose: the role is
 * `customer`, and the customer is the card the admin is standing on.
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 */
import { validateMember, type FieldError } from "./team";

export type PortalAccountInput = { name: string; email: string; password: string };

export function validatePortalAccount(input: PortalAccountInput): FieldError[] {
  // `sales` is only a placeholder that satisfies the role check; every error
  // about the role is dropped, because there is no role to get wrong here.
  return validateMember({ ...input, role: "sales" }).filter((e) => e.field !== "role");
}
