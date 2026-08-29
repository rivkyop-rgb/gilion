"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import { AREA_LABELS } from "@/lib/auth/labels";
import { canAccessPlatform, type Area, type Role } from "@/lib/auth/rbac";
import { effectiveAccess, type PermissionOverrides } from "@/lib/domain/permissions";
import { cn } from "@/lib/utils";
import { BUILT_THROUGH_STAGE, NAV_ITEMS } from "./nav-items";

export function SidebarContent({
  role,
  isSuperAdmin = false,
  permissions = {},
}: {
  role: Role;
  isSuperAdmin?: boolean;
  /** The business's overrides (FR-8). The menu must agree with the guards. */
  permissions?: PermissionOverrides;
}) {
  const pathname = usePathname();

  // The menu is filtered from the same matrix the server guards with, so an
  // item can never appear here while the route rejects it (or vice versa).
  const items = NAV_ITEMS.filter((i) => {
    if (i.area === "platform") return canAccessPlatform(isSuperAdmin);
    if (isSuperAdmin) return true;
    return effectiveAccess(role, i.area as Area, permissions) !== "none";
  });

  return (
    <nav className="flex h-full flex-col gap-1" aria-label="ניווט ראשי">
      <Link href="/dashboard" className="mb-4 flex items-center gap-3 px-2">
        <Image src="/brand/logo-mark.png" alt="" width={54} height={36} priority />
        <span className="font-serif text-xl font-bold text-primary">Gilion</span>
      </Link>

      {items.map((item) => {
        const Icon = (Icons[item.icon as keyof typeof Icons] ??
          Icons.Circle) as React.ComponentType<{ className?: string }>;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const ready = item.stage <= BUILT_THROUGH_STAGE;
        const label = AREA_LABELS[item.area];

        if (!ready) {
          return (
            <span
              key={item.area}
              aria-disabled="true"
              title={`ייבנה בשלב ${String(item.stage).padStart(2, "0")}`}
              className="flex cursor-not-allowed items-center gap-3 rounded-sm px-3 py-2 text-sm text-outline opacity-60"
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </span>
          );
        }

        return (
          <Link
            key={item.area}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors",
              // RTL: the active marker is a border on the start edge (border-s),
              // which renders on the right in Hebrew.
              active
                ? "border-s-4 border-secondary bg-state-active font-semibold text-on-secondary-container"
                : "text-on-surface-variant hover:bg-surface-container-low",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
