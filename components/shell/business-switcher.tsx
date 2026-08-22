"use client";

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
  onSelect: (formData: FormData) => void;
}) {
  const single = options.length <= 1;

  if (single) {
    return (
      <span className="flex items-center gap-2 rounded-full bg-surface-container px-3 py-1.5 text-xs font-medium text-on-surface-variant">
        <Building2 className="size-3.5" />
        {current.businessName}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full bg-surface-container px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:bg-surface-container-high">
        <Building2 className="size-3.5" />
        {current.businessName}
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>

      <DropdownMenuContent>
        <DropdownMenuLabel>החלפת עסק פעיל</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <form key={o.businessId} action={onSelect}>
            <input type="hidden" name="businessId" value={o.businessId} />
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                <Check
                  className={
                    o.businessId === current.businessId
                      ? "size-4 text-secondary"
                      : "size-4 opacity-0"
                  }
                />
                <span className="flex-1 text-start">{o.businessName}</span>
                <span className="text-xs text-on-surface-variant">{ROLE_LABELS[o.role]}</span>
              </button>
            </DropdownMenuItem>
          </form>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
