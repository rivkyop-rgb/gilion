"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import { AREA_LABELS } from "@/lib/auth/labels";
import { canAccessPlatform, type Area, type Role } from "@/lib/auth/rbac";
import { effectiveAccess, type PermissionOverrides } from "@/lib/domain/permissions";
import { BrandMark, type BrandKeys } from "@/components/brand/brand-mark";
import { cn } from "@/lib/utils";
import { BUILT_THROUGH_STAGE, NAV_GROUP_LABELS, NAV_ITEMS, type NavGroup } from "./nav-items";
import { OPEN_PALETTE_EVENT } from "./command-palette";

/**
 * Where the collapsed/expanded choice is remembered.
 *
 * Deliberately localStorage and not a user setting in the database: this is a
 * property of the SCREEN someone is sitting at, not of the person. The same
 * user on a laptop and on a 27" monitor wants different answers, and a stored
 * preference would follow them from one to the other and be wrong at one end.
 */
const STORAGE_KEY = "gilion.sidebar.collapsed";

/**
 * Below this the rail collapses on its own, whatever was last chosen.
 *
 * 1280px is where the placement board stops fitting its three panels and a
 * spread beside a full-width menu. Collapsing automatically is the point: the
 * person laying out a newspaper should not have to notice they are out of room
 * and go looking for a control.
 */
const AUTO_COLLAPSE_BELOW = 1280;

type NavProps = {
  role: Role;
  isSuperAdmin?: boolean;
  /** The business's overrides (FR-8). The menu must agree with the guards. */
  permissions?: PermissionOverrides;
  /**
   * The business's own mark and name (stage 11). Resolved by the layout, never
   * by this component: a path to a logo written in here is a logo the admin
   * panel cannot replace.
   */
  brand?: { keys: BrandKeys; name: string };
};

/**
 * Screens that need the room more than they need the menu.
 *
 * The placement board is the whole product on one screen — three panels and a
 * printed page that has to be visible end to end. Arriving there with a full
 * menu open and expecting the person to notice a control and collapse it is
 * asking them to do the layout's job.
 */
const ROOM_HUNGRY = /^\/issues\/[^/]+\/board/;

function useSidebarCollapsed() {
  const pathname = usePathname();
  const [narrow, setNarrow] = useState(false);
  const [stored, setStored] = useState(false);
  /** Set by the toggle, cleared on navigation — this visit's answer. */
  const [override, setOverride] = useState<boolean | null>(null);

  useEffect(() => {
    // Read in a callback rather than in the effect body: both values come from
    // the browser, which the server render cannot see, and setting them
    // synchronously on mount is the cascading render React warns about.
    const apply = () => {
      setNarrow(window.innerWidth < AUTO_COLLAPSE_BELOW);
      try {
        setStored(window.localStorage.getItem(STORAGE_KEY) === "1");
      } catch {
        // Private windows and blocked site data both throw here. A menu is not
        // worth failing a page over.
      }
    };

    const frame = window.requestAnimationFrame(apply);
    window.addEventListener("resize", apply);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", apply);
    };
  }, []);

  const wantsRoom = ROOM_HUNGRY.test(pathname);

  // A deliberate choice belongs to the screen it was made on: expanding the
  // menu to find something does not mean wanting it open on the next board.
  // Tracked against the path it was made on rather than reset in an effect,
  // which would be a second render for something already known during the
  // first.
  const [choiceFor, setChoiceFor] = useState<string | null>(null);
  const liveOverride = choiceFor === pathname ? override : null;
  // Too narrow to fit one at all beats every preference; after that the
  // person's own click wins; then the screen's default; then what they last
  // chose elsewhere.
  const collapsed = narrow || (liveOverride ?? (wantsRoom || stored));

  const toggle = () => {
    const next = !collapsed;
    setOverride(next);
    setChoiceFor(pathname);
    try {
      // Only remembered off the board — otherwise one expand there would set
      // the preference for every other screen.
      if (!wantsRoom) window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // See above — the toggle still works for this page load.
    }
    if (!wantsRoom) setStored(next);
  };

  return { collapsed, toggle };
}

/**
 * The sidebar as it appears beside the page, with its own width.
 *
 * The rail owns the collapsed state because the width belongs to the `<aside>`
 * and the toggle belongs to the nav inside it — one `useState` shared by both,
 * rather than two that can disagree about whether the menu is open.
 *
 * Hovering a collapsed rail opens it as an OVERLAY: the aside keeps its narrow
 * width and the nav floats over the page. Widening the aside on hover would
 * reflow the screen under the pointer, which is the same class of bug as a
 * notice that pushes a canvas out from under a drag.
 */
export function SidebarRail(props: NavProps) {
  const { collapsed, toggle } = useSidebarCollapsed();
  const [peeking, setPeeking] = useState(false);

  return (
    <aside
      data-testid="sidebar-rail"
      data-collapsed={collapsed}
      onPointerEnter={() => collapsed && setPeeking(true)}
      onPointerLeave={() => setPeeking(false)}
      className={cn(
        // The deep navy of the logo frames the page (redesign, 29/09/2026). It
        // needs no border: the change of colour is the edge.
        "relative hidden shrink-0 bg-sidebar text-on-sidebar transition-[width] duration-150 lg:block",
        collapsed ? "w-16" : "w-70",
      )}
    >
      <div
        className={cn(
          "h-full bg-sidebar p-3",
          // Only the peeking state leaves the rail's own box.
          collapsed && peeking ? "absolute inset-y-0 start-0 z-30 w-70 shadow-elevation-2" : "",
        )}
      >
        <SidebarNav {...props} collapsed={collapsed && !peeking} onToggle={toggle} />
      </div>
    </aside>
  );
}

/**
 * The same menu inside the mobile sheet, where there is nothing to collapse:
 * the sheet is already a deliberate act of opening it.
 */
export function SidebarContent(props: NavProps) {
  return <SidebarNav {...props} collapsed={false} />;
}

function ToggleButton({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const label = collapsed ? "הרחבת התפריט" : "צמצום התפריט";
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid="sidebar-toggle"
      aria-pressed={collapsed}
      aria-label={label}
      title={label}
      className="shrink-0 rounded-sm p-1.5 text-on-sidebar-muted hover:bg-sidebar-hover hover:text-inverse-on-surface"
    >
      {/* RTL: PanelRight is the panel on the reading-start side. */}
      {collapsed ? <Icons.PanelLeft className="size-4" /> : <Icons.PanelRight className="size-4" />}
    </button>
  );
}

function SidebarNav({
  role,
  isSuperAdmin = false,
  permissions = {},
  brand,
  collapsed,
  onToggle,
}: NavProps & { collapsed: boolean; onToggle?: () => void }) {
  const pathname = usePathname();

  // The menu is filtered from the same matrix the server guards with, so an
  // item can never appear here while the route rejects it (or vice versa).
  const items = NAV_ITEMS.filter((i) => {
    if (i.area === "platform") return canAccessPlatform(isSuperAdmin);
    if (isSuperAdmin) return true;
    return effectiveAccess(role, i.area as Area, permissions) !== "none";
  });

  const groups = (Object.keys(NAV_GROUP_LABELS) as NavGroup[])
    .map((group) => ({ group, items: items.filter((i) => i.group === group) }))
    .filter((g) => g.items.length > 0);

  return (
    <nav className="flex h-full flex-col gap-1" aria-label="ניווט ראשי">
      <div className={cn("mb-4 flex items-center gap-2", collapsed ? "justify-center" : "px-1")}>
        <Link href="/dashboard" className="flex min-w-0 flex-1 items-center gap-3">
          {/* A white tile, because the mark is navy and the rail is navy: an
              uploaded logo has to stay visible whatever colour it is. */}
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-surface-container-lowest">
            <BrandMark
              slot="mark"
              keys={brand?.keys}
              width={34}
              height={34}
              className="size-[34px]"
            />
          </span>
          {!collapsed ? (
            <span
              data-testid="sidebar-brand-name"
              className="truncate font-serif text-xl font-bold whitespace-nowrap text-inverse-on-surface"
            >
              {brand?.name || "Gilion"}
            </span>
          ) : null}
        </Link>

        {onToggle && !collapsed ? <ToggleButton collapsed={collapsed} onToggle={onToggle} /> : null}
      </div>

      {/* Collapsed, the control gets its own centred row: there is no width
          left to sit beside the mark, and a button crammed against the edge is
          the one nobody finds. */}
      {onToggle && collapsed ? (
        <div className="mb-2 flex justify-center">
          <ToggleButton collapsed={collapsed} onToggle={onToggle} />
        </div>
      ) : null}

      {/* Quick search and actions — the same window Ctrl+K opens. */}
      <button
        type="button"
        data-testid="open-command-palette"
        onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
        title={collapsed ? "חיפוש ופעולות (Ctrl+K)" : undefined}
        aria-label="חיפוש ופעולות"
        className={cn(
          "mb-3 flex h-10 items-center gap-2 rounded-lg border border-sidebar-hover bg-sidebar-hover/60 text-sm text-on-sidebar-muted transition-colors hover:text-inverse-on-surface",
          collapsed ? "justify-center px-0" : "px-3",
        )}
      >
        <Icons.Search className="size-4 shrink-0" aria-hidden />
        {collapsed ? null : (
          <>
            <span className="flex-1 text-start">חיפוש ופעולות</span>
            <kbd className="rounded border border-on-sidebar-muted/40 px-1.5 text-xs" dir="ltr">
              Ctrl K
            </kbd>
          </>
        )}
      </button>

      {groups.map(({ group, items: groupItems }, index) => (
        <div
          key={group}
          role="group"
          aria-label={NAV_GROUP_LABELS[group]}
          className="flex flex-col gap-0.5"
        >
          {/* Expanded, a group is named; collapsed, a hairline is all the room
              there is, and the tooltips carry the names. */}
          {collapsed ? (
            index > 0 ? (
              <hr className="mx-2 my-2 border-sidebar-hover" aria-hidden />
            ) : null
          ) : (
            <span
              className={cn(
                "px-3 pb-1 text-xs font-medium text-on-sidebar-muted",
                index > 0 && "pt-4",
              )}
              aria-hidden
            >
              {NAV_GROUP_LABELS[group]}
            </span>
          )}

          {groupItems.map((item) => {
            const Icon = (Icons[item.icon as keyof typeof Icons] ??
              Icons.Circle) as React.ComponentType<{ className?: string }>;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const ready = item.stage <= BUILT_THROUGH_STAGE;
            const label = AREA_LABELS[item.area];

            // With the label off screen the tooltip is the only thing naming the
            // icon, so a rail stays readable without being expanded.
            const title = collapsed ? label : undefined;

            if (!ready) {
              return (
                <span
                  key={item.area}
                  aria-disabled="true"
                  title={title ?? `ייבנה בשלב ${String(item.stage).padStart(2, "0")}`}
                  className={cn(
                    "flex cursor-not-allowed items-center gap-3 rounded-lg py-2.5 text-sm text-on-sidebar-muted opacity-60",
                    collapsed ? "justify-center px-0" : "px-3",
                  )}
                >
                  <Icon className="size-5 shrink-0" />
                  {collapsed ? <span className="sr-only">{label}</span> : label}
                </span>
              );
            }

            return (
              <Link
                key={item.area}
                href={item.href}
                title={title}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg py-2.5 text-[15px] transition-colors",
                  collapsed ? "justify-center px-0" : "px-3",
                  // Gold on navy marks where you are. It is the only gold in
                  // the menu, so it cannot be mistaken for a status.
                  active
                    ? "bg-sidebar-active font-semibold text-state-active"
                    : "text-on-sidebar hover:bg-sidebar-hover hover:text-inverse-on-surface",
                )}
              >
                <Icon className="size-5 shrink-0" />
                {collapsed ? <span className="sr-only">{label}</span> : label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
