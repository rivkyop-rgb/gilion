"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  {
    href: "/portal",
    label: "הבקשות שלי",
    match: (p: string) => p === "/portal" || p.startsWith("/portal/requests"),
  },
  {
    href: "/portal/tear-sheets",
    label: "הוכחות פרסום",
    match: (p: string) => p.startsWith("/portal/tear-sheets"),
  },
  {
    href: "/portal/account",
    label: "החשבון שלי",
    match: (p: string) => p.startsWith("/portal/account"),
  },
];

/** Three places, not a menu: the portal's whole map (app-shell.md §4). */
export function PortalNav() {
  const path = usePathname();
  return (
    <nav aria-label="ניווט בפורטל" className="flex gap-1">
      {ITEMS.map((item) => {
        const active = item.match(path);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            data-testid={`portal-nav-${item.href === "/portal" ? "requests" : item.href.slice("/portal/".length)}`}
            className={cn(
              "rounded-sm px-3 py-1.5 text-sm",
              active
                ? "bg-surface-container font-semibold text-on-surface"
                : "text-on-surface-variant hover:bg-surface-container-low",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
