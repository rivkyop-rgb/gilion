"use client";

import { useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * A GET filter form that applies itself (08/11/2026).
 *
 * The habodek run picked a customer on the ads screen and waited — nothing
 * happened until a "סינון" button further along the row was found. Every
 * select and date here now navigates the moment it changes; text fields apply
 * on Enter. The URL stays the whole state, exactly as with the native GET
 * form: only the way there changed — `router.replace` with `scroll: false`, so
 * the page neither reloads nor jumps to the top, and Back leaves the screen
 * instead of stepping through every filter that was tried.
 *
 * Fields stay UNCONTROLLED and values are read from `FormData` — the same
 * reason the dashboard filters do it (a controlled field can permanently hold
 * a value React does not know about).
 */
export function AutoSubmitForm({
  children,
  className,
  testId,
  liveText = false,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
  /** Text fields apply as one types (after a short pause), not only on Enter. */
  liveText?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = (form: HTMLFormElement) => {
    const params = new URLSearchParams();
    for (const [key, raw] of new FormData(form)) {
      const value = String(raw).trim();
      // An empty field is "no filter"; leaving it out keeps the link readable.
      if (value) params.append(key, value);
    }
    const search = params.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };

  return (
    <form
      className={className}
      data-testid={testId}
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        go(e.currentTarget);
      }}
      onChange={(e) => {
        const form = e.currentTarget;
        const target = e.target as unknown as HTMLElement;
        if (timer.current) clearTimeout(timer.current);
        const isText =
          target instanceof HTMLInputElement &&
          !["date", "checkbox", "radio"].includes(target.type);
        // A Combobox's own search box is a search term, not a choice: the
        // Combobox submits when something is picked from its list.
        if (isText && target.getAttribute("role") === "combobox") return;
        if (isText) {
          // Typing is not a choice yet — wait for a pause, or for Enter.
          if (liveText) timer.current = setTimeout(() => go(form), 400);
          return;
        }
        go(form);
      }}
    >
      {children}
    </form>
  );
}
