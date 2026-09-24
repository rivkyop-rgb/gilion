"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";
import { AREA_LABELS } from "@/lib/auth/labels";
import { NAV_ITEMS } from "./nav-items";

/**
 * `🏠 / לקוחות` above the title of any page BELOW a menu section
 * (app-shell.md §3). The page's own name is its title right underneath, so the
 * trail names only the way back — which is the part a detail page lacks.
 *
 * Not on a section's own list (the menu already marks it), and not on the
 * placement board: every pixel above that canvas is taken from the printed
 * page, which is fitted to the room left for it (useFittedSpread).
 */
export function Breadcrumbs() {
  const pathname = usePathname();
  if (/^\/issues\/[^/]+\/board/.test(pathname)) return null;

  const section = NAV_ITEMS.find((i) => pathname.startsWith(`${i.href}/`));
  if (!section) return null;

  return (
    <nav aria-label="מיקום בעמוד" className="mb-3 text-xs text-on-surface-variant">
      <ol className="flex items-center gap-1.5">
        <li>
          <Link href="/dashboard" aria-label="לוח בקרה" className="hover:text-on-surface">
            <Home className="size-3.5" />
          </Link>
        </li>
        <li aria-hidden>/</li>
        <li>
          <Link href={section.href} className="hover:text-on-surface hover:underline">
            {AREA_LABELS[section.area]}
          </Link>
        </li>
      </ol>
    </nav>
  );
}
