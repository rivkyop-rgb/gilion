import Link from "next/link";
import { UserRound } from "lucide-react";

/**
 * "מוצגים רק X של <לקוח>" — on every list a customer's card links to.
 *
 * The links on the card always carried `?customer=`, and the lists always
 * filtered by it — but only the orders page SAID so. Everywhere else the title
 * stayed "פרסומים" / "דוחות" and the only trace was a value inside a filter
 * field, so a filtered list read as the whole list (26/09/2026). One component,
 * so the four screens say it the same way.
 */
export function CustomerScopeBanner({
  customerId,
  name,
  what,
  clearHref,
  testId = "customer-scope",
}: {
  customerId: string;
  name: string;
  /** "ההזמנות", "הפרסומים", "הקבצים", "השורות" — what the list holds. */
  what: string;
  /** The same list with the customer taken off. */
  clearHref: string;
  testId?: string;
}) {
  return (
    <p
      data-testid={testId}
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-status-info-bg px-4 py-3 text-sm text-status-info-fg"
    >
      <UserRound className="size-4 shrink-0" aria-hidden />
      <span>
        מוצגים רק {what} של <strong>{name}</strong>.
      </span>
      <Link href={`/customers/${customerId}`} className="underline">
        לכרטיס הלקוח
      </Link>
      <Link href={clearHref} className="underline" data-testid={`${testId}-clear`}>
        הצגת הכל
      </Link>
    </p>
  );
}
