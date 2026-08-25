"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NewspaperTabs({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/settings/newspapers/${id}`;

  const tabs = [
    { href: base, label: "כללי וסוגי עמודים" },
    { href: `${base}/pricing`, label: "מחירון" },
    { href: `${base}/shapes`, label: "צורות פרסום ומיקומים" },
  ];

  return (
    <nav className="mb-6 flex gap-1 border-b border-outline-variant" aria-label="הגדרות העיתון">
      {tabs.map((t) => {
        const active = t.href === base ? pathname === base : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm transition-colors",
              active
                ? "border-secondary font-semibold text-on-surface"
                : "border-transparent text-on-surface-variant hover:text-on-surface",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
