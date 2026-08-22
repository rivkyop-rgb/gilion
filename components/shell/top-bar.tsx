"use client";

import { LogOut, Menu } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ROLE_LABELS } from "@/lib/auth/labels";
import type { Role } from "@/lib/auth/rbac";
import { BusinessSwitcher, type SwitcherBusiness } from "./business-switcher";
import { SidebarContent } from "./sidebar";

export function TopBar({
  userName,
  role,
  current,
  options,
  onSelectBusiness,
  onSignOut,
}: {
  userName: string;
  role: Role;
  current: SwitcherBusiness;
  options: SwitcherBusiness[];
  onSelectBusiness: (formData: FormData) => void;
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
          <SheetContent title="ניווט ראשי">
            <div onClick={() => setOpen(false)}>
              <SidebarContent role={role} />
            </div>
          </SheetContent>
        </Sheet>

        <BusinessSwitcher current={current} options={options} onSelect={onSelectBusiness} />
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-on-surface-variant sm:inline">
          {userName} · {ROLE_LABELS[role]}
        </span>
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
