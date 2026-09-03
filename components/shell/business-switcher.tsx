"use client";

import { useTransition } from "react";
import { Building2, Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS } from "@/lib/auth/labels";
import type { Role } from "@/lib/auth/rbac";

export type SwitcherBusiness = { businessId: string; businessName: string; role: Role };

/**
 * Replaces the decorative "EDITORIAL PORTAL" chip from the Stitch design with
 * the real active-business control (docs/plan/01-auth-multitenancy.md).
 * Same position, same shape, actual meaning.
 */
export function BusinessSwitcher({
  current,
  options,
  onSelect,
}: {
  current: SwitcherBusiness;
  options: SwitcherBusiness[];
  onSelect: (businessId: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const single = options.length <= 1;

  if (single) {
    return (
      /* Same testid as the dropdown below carries, so "which business am I in"
         is answerable without first knowing how many the user has. */
      <span
        data-testid="active-business"
        className="flex items-center gap-2 rounded-full bg-surface-container px-3 py-1.5 text-xs font-medium text-on-surface-variant"
      >
        <Building2 className="size-3.5" />
        {current.businessName}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="business-switcher"
        data-active-business=""
        disabled={pending}
        className="flex items-center gap-2 rounded-full bg-surface-container px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:bg-surface-container-high disabled:opacity-60"
      >
        <Building2 className="size-3.5" />
        {current.businessName}
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>

      <DropdownMenuContent>
        <DropdownMenuLabel>החלפת עסק פעיל</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuItem
            key={o.businessId}
            data-testid={`business-option-${o.businessId}`}
            // preventDefault keeps Radix from closing the menu before the
            // action is dispatched; the transition then runs it.
            onSelect={(e) => {
              e.preventDefault();
              startTransition(async () => {
                await onSelect(o.businessId);
                // A FULL page load, and not `router.push` — see the comment in
                // app/(internal)/actions.ts for why the navigation may not
                // happen inside the action. A document request is the only kind
                // that is guaranteed to carry the session cookie the action just
                // set, and switching tenant is exactly the moment to throw away
                // every client-side cache of the previous one's data anyway.
                window.location.assign("/dashboard");
              });
            }}
          >
            <Check
              className={
                o.businessId === current.businessId ? "size-4 text-secondary" : "size-4 opacity-0"
              }
            />
            <span className="flex-1 text-start">{o.businessName}</span>
            <span className="text-xs text-on-surface-variant">{ROLE_LABELS[o.role]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
