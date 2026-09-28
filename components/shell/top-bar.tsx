"use client";

import Link from "next/link";
import { LogOut, Menu } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ROLE_LABELS, SUPER_ADMIN_LABEL } from "@/lib/auth/labels";
import type { Role } from "@/lib/auth/rbac";
import type { PermissionOverrides } from "@/lib/domain/permissions";
import { BusinessSwitcher, type SwitcherBusiness } from "./business-switcher";
import { SidebarContent } from "./sidebar";

export function TopBar({
  userName,
  role,
  isSuperAdmin = false,
  permissions = {},
  current,
  options,
  onSelectBusiness,
  onSignOut,
}: {
  userName: string;
  role: Role;
  isSuperAdmin?: boolean;
  permissions?: PermissionOverrides;
  current: SwitcherBusiness;
  options: SwitcherBusiness[];
  onSelectBusiness: (businessId: string) => Promise<void>;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-outline-variant bg-surface-container-lowest px-4 lg:px-8">
      <div className="flex items-center gap-3">
        {/* Below 1024px the sidebar collapses into a drawer. */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="rounded-sm p-2 text-on-surface-variant hover:bg-surface-container lg:hidden">
            <Menu className="size-5" />
            <span className="sr-only">פתיחת תפריט</span>
          </SheetTrigger>
          <SheetContent
            title="ניווט ראשי"
            // The same navy as the rail, close button included — the menu is
            // one object whether it sits beside the page or slides over it.
            className="border-0 bg-sidebar [&>button]:text-on-sidebar [&>button]:hover:bg-sidebar-hover"
          >
            <div onClick={() => setOpen(false)}>
              <SidebarContent role={role} isSuperAdmin={isSuperAdmin} permissions={permissions} />
            </div>
          </SheetContent>
        </Sheet>

        <BusinessSwitcher current={current} options={options} onSelect={onSelectBusiness} />
      </div>

      <div className="flex items-center gap-3">
        {/*
         * The only route to "my account", and therefore to changing your own
         * password. It is not under /settings on purpose: that area is admin
         * only (FR-8), and a designer needs this screen as much as anyone.
         */}
        <Link
          href="/account"
          data-testid="account-link"
          className="hidden rounded-sm px-2 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container sm:inline"
        >
          {userName} · {isSuperAdmin ? SUPER_ADMIN_LABEL : ROLE_LABELS[role]}
        </Link>
        <form action={onSignOut}>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">יציאה</span>
          </button>
        </form>
      </div>
    </header>
  );
}
