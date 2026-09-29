"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Plus, Search, Users, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { OPEN_PALETTE_EVENT } from "./command-palette";

/**
 * The bottom bar on a phone (redesign, 29/09/2026): today, customers, a new
 * order in the thumb's reach, billing, and search.
 *
 * It ADDS a way around on a small screen; the full menu is still the drawer
 * behind the top bar's button, and every link here is a screen that exists.
 * Which of them appear is decided by the layout from the same permission
 * matrix as the sidebar (FR-8).
 */
export function MobileTabBar({
  mayCustomers,
  mayCreateOrder,
  mayBilling,
}: {
  mayCustomers: boolean;
  mayCreateOrder: boolean;
  mayBilling: boolean;
}) {
  const pathname = usePathname();
  const tab = (href: string, label: string, Icon: typeof Users) => {
    const on = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        href={href}
        aria-current={on ? "page" : undefined}
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px]",
          on ? "font-semibold text-primary" : "text-on-surface-variant",
        )}
      >
        <Icon className="size-5" aria-hidden />
        {label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="ניווט מהיר"
      data-testid="mobile-tab-bar"
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-outline-variant bg-surface-container-lowest pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {tab("/dashboard", "היום", LayoutDashboard)}
      {mayCustomers ? tab("/customers", "לקוחות", Users) : null}
      {mayCreateOrder ? (
        <Link
          href="/orders/new"
          aria-label="הזמנה חדשה"
          className="flex flex-1 items-center justify-center"
        >
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-gold text-on-brand-gold shadow-elevation-1">
            <Plus className="size-6" aria-hidden />
          </span>
        </Link>
      ) : null}
      {mayBilling ? tab("/billing", "גבייה", Wallet) : null}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-on-surface-variant"
      >
        <Search className="size-5" aria-hidden />
        חיפוש
      </button>
    </nav>
  );
}
