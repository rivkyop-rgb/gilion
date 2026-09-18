"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { switchBusinessAction } from "@/app/(internal)/actions";

/**
 * A super admin's way in (17/09/2026).
 *
 * The flag already opens every screen of every business — nothing in the app
 * hides anything from them once they are inside one. What was missing was the
 * door: the only way in was the business picker at sign-in, so this list read
 * as though the orders behind it were somebody else's to see.
 *
 * The navigation is a full load, not router.push: the action writes a new
 * session cookie, and a client navigation would render the destination from
 * the session this tab still holds (see the note in switchBusinessAction).
 */
export function EnterBusiness({
  businessId,
  businessName,
  href = "/orders",
  label,
  testId,
  asLink = false,
}: {
  businessId: string;
  businessName: string;
  href?: string;
  /** Overrides the button's text — the orders count uses its own number. */
  label?: string;
  testId?: string;
  /** Drawn as a link, for the counts inside the table. */
  asLink?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const enter = () =>
    start(async () => {
      await switchBusinessAction(businessId);
      router.refresh();
      window.location.assign(href);
    });

  if (asLink) {
    return (
      <button
        type="button"
        onClick={enter}
        disabled={pending}
        data-testid={testId ?? `enter-business-${businessId}`}
        aria-label={`כניסה ל${businessName}`}
        className="underline"
      >
        {label}
      </button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={pending}
      data-testid={testId ?? `enter-business-${businessId}`}
      aria-label={`כניסה ל${businessName}`}
      onClick={enter}
      className="whitespace-nowrap"
    >
      <LogIn className="size-4" />
      {pending ? "נכנסת…" : "כניסה לעסק"}
    </Button>
  );
}
