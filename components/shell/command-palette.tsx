"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as Icons from "lucide-react";

import { AREA_LABELS } from "@/lib/auth/labels";
import { canAccessPlatform, type Area, type Role } from "@/lib/auth/rbac";
import { effectiveAccess, type PermissionOverrides } from "@/lib/domain/permissions";
import { orderNumber } from "@/app/(internal)/orders/format";
import { paletteSearchAction, type PaletteResults } from "@/app/(internal)/command-actions";
import { cn } from "@/lib/utils";
import { BUILT_THROUGH_STAGE, NAV_ITEMS } from "./nav-items";

/** Anything that opens the window — the sidebar's button — says so with this. */
export const OPEN_PALETTE_EVENT = "gilion:open-palette";

const noSubscribe = () => () => {};
/**
 * "⌘" on a Mac, "Ctrl" elsewhere — what the key is called on the keyboard in
 * front of the person. The server renders "Ctrl" and the browser corrects it.
 */
export function useModKeyLabel(): string {
  return useSyncExternalStore(
    noSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}

type Item = {
  key: string;
  group: string;
  label: string;
  hint?: string;
  href: string;
  icon: keyof typeof Icons;
};

/**
 * Quick search and actions, from any screen: Ctrl+K / ⌘K (redesign,
 * 29/09/2026).
 *
 * It ADDS a way in and removes none — every result is a link to a screen that
 * already exists, with the same URL the screen's own buttons use (the billing
 * window by `?customer=`, a new order by `?customer=`). What a role may not
 * read is never returned by the server, so nothing here decides permissions.
 */
export function CommandPalette({
  role,
  isSuperAdmin = false,
  permissions = {},
  mayCreateOrder,
}: {
  role: Role;
  isSuperAdmin?: boolean;
  permissions?: PermissionOverrides;
  mayCreateOrder: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  /** The last answer, stamped with the text that produced it (see payment-editor). */
  const [found, setFound] = useState<{ q: string; results: PaletteResults } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const mod = useModKeyLabel();

  // Ctrl+K / ⌘K anywhere, and the sidebar's button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // `code` is the physical key, so Ctrl+K still opens with the keyboard on
      // Hebrew, where `key` is "ל". `key` stays for layouts that move K.
      if ((e.ctrlKey || e.metaKey) && (e.code === "KeyK" || e.key.toLowerCase() === "k")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  // Asked of the server, debounced; the answer is kept with its question so a
  // stale one is never shown for newer text.
  const term = q.trim();
  useEffect(() => {
    if (!term) return;
    let live = true;
    const timer = setTimeout(async () => {
      const results = await paletteSearchAction(term);
      if (live) setFound({ q: term, results });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [term]);
  const results = found && found.q === term ? found.results : null;

  const screens = useMemo(
    () =>
      NAV_ITEMS.filter((i) => {
        if (i.stage > BUILT_THROUGH_STAGE) return false;
        if (i.area === "platform") return canAccessPlatform(isSuperAdmin);
        if (isSuperAdmin) return true;
        return effectiveAccess(role, i.area as Area, permissions) !== "none";
      }),
    [role, isSuperAdmin, permissions],
  );

  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    const needle = term.toLowerCase();
    if (mayCreateOrder && (!needle || "הזמנה חדשה".includes(needle))) {
      out.push({
        key: "new-order",
        group: "פעולות",
        label: "הזמנה חדשה",
        href: "/orders/new",
        icon: "Plus",
      });
    }
    for (const c of results?.customers ?? []) {
      out.push({
        key: `c-${c.id}`,
        group: "לקוחות",
        label: c.name,
        hint: "כרטיס לקוח",
        href: `/customers/${c.id}`,
        icon: "User",
      });
      if (c.mayPay) {
        out.push({
          key: `pay-${c.id}`,
          group: "לקוחות",
          label: `רישום תשלום · ${c.name}`,
          href: `/billing?customer=${c.id}`,
          icon: "Wallet",
        });
      }
      if (c.mayOrder) {
        out.push({
          key: `order-${c.id}`,
          group: "לקוחות",
          label: `הזמנה חדשה · ${c.name}`,
          href: `/orders/new?customer=${c.id}`,
          icon: "Plus",
        });
      }
    }
    for (const o of results?.orders ?? []) {
      out.push({
        key: `o-${o.id}`,
        group: "הזמנות",
        label: `${orderNumber(o.number)} · ${o.customerName}`,
        href: `/orders/${o.id}`,
        icon: "ClipboardList",
      });
    }
    for (const s of screens) {
      const label = AREA_LABELS[s.area];
      if (needle && !label.toLowerCase().includes(needle)) continue;
      out.push({
        key: `nav-${s.area}`,
        group: "מסכים",
        label,
        href: s.href,
        icon: s.icon as keyof typeof Icons,
      });
    }
    return out;
  }, [term, results, screens, mayCreateOrder]);

  const current = Math.min(active, Math.max(0, items.length - 1));

  const go = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    setQ("");
    router.push(item.href);
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQ("");
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-primary-container/45" />
        <DialogPrimitive.Content
          data-testid="command-palette"
          className="fixed inset-x-0 top-[12dvh] z-50 mx-auto flex max-h-[70dvh] w-[min(40rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-elevation-2"
        >
          <DialogPrimitive.Title className="sr-only">חיפוש ופעולות</DialogPrimitive.Title>
          <label className="flex h-16 items-center gap-3 border-b border-outline-variant px-5">
            <Icons.Search className="size-5 text-on-surface-variant" aria-hidden />
            <input
              autoFocus
              value={q}
              data-testid="command-input"
              aria-label="מה לחפש או לעשות"
              placeholder="לקוח, מספר הזמנה, מסך או פעולה…"
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, items.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(items[current]);
                }
              }}
              className="h-full flex-1 bg-transparent text-lg outline-none placeholder:text-outline"
            />
            <kbd className="rounded border border-outline-variant px-2 py-0.5 text-xs text-on-surface-variant">
              Esc
            </kbd>
          </label>

          <div ref={listRef} role="listbox" aria-label="תוצאות" className="overflow-y-auto p-2">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-on-surface-variant">
                {term && !results ? "מחפשת…" : "לא נמצא דבר. אפשר לנסות שם חלקי או מספר הזמנה."}
              </p>
            ) : (
              items.map((item, i) => {
                const Icon = (Icons[item.icon] ?? Icons.Circle) as React.ComponentType<{
                  className?: string;
                }>;
                const first = i === 0 || items[i - 1]!.group !== item.group;
                return (
                  <div key={item.key}>
                    {first ? (
                      <p className="px-3 pt-3 pb-1 text-xs font-semibold text-on-surface-variant">
                        {item.group}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === current}
                      data-testid={`command-item-${item.key}`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(item)}
                      className={cn(
                        "flex h-11 w-full items-center gap-3 rounded-lg px-3 text-start text-sm",
                        i === current
                          ? "bg-status-info-bg font-semibold"
                          : "hover:bg-surface-container-low",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-lg",
                          i === current
                            ? "bg-primary text-on-primary"
                            : "bg-surface-container text-primary",
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.hint ? (
                        <span className="text-xs font-normal text-on-surface-variant">
                          {item.hint}
                        </span>
                      ) : null}
                      {i === current ? (
                        <kbd className="rounded border border-primary/30 px-1.5 text-xs font-normal text-primary">
                          Enter
                        </kbd>
                      ) : null}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <p className="flex gap-4 border-t border-outline-variant bg-surface-container-low px-5 py-2.5 text-xs text-on-surface-variant">
            <span>↑↓ מעבר</span>
            <span>Enter פתיחה</span>
            <span className="ms-auto" dir="ltr">{`${mod}+K`}</span>
            <span>פותח מכל מסך</span>
          </p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
