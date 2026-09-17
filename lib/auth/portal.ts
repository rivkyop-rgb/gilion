/**
 * Every portal page and action starts here — the portal's getTenantContext().
 *
 * The scope it returns carries the customer as well as the business, and the
 * portal's data layer (lib/data/portal.ts) adds BOTH to every query. Two
 * layers, not one: a missing customer filter inside the right business would
 * still hand one advertiser another advertiser's requests.
 */
import { auth } from "./config";
import { activeMembership } from "./memberships";
import { customerScopeFrom, NotCustomerError, type CustomerScope } from "./portal-scope";

export { NotCustomerError, type CustomerScope } from "./portal-scope";

export async function getCustomerScope(): Promise<CustomerScope> {
  const session = await auth();
  const scope = customerScopeFrom(session?.user);

  // The session is a 30-day JWT that is never rewritten on activity
  // (middleware.ts). Trusting it alone would let an account an admin just
  // closed keep submitting requests for a month. Staff are re-checked when
  // they switch business; a customer never switches, so the check lives here,
  // once per request. It also catches a membership moved to another customer.
  const membership = await activeMembership(scope.userId, scope.businessId);
  if (!membership || membership.role !== "customer" || membership.customerId !== scope.customerId) {
    throw new NotCustomerError("membership is no longer active");
  }
  return scope;
}
