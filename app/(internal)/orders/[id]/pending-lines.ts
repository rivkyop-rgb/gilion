"use client";

import { useSyncExternalStore } from "react";

/**
 * How many dates are picked in the line builder and not yet added to the order.
 *
 * Shared between the builder and the action bar, which are separate islands on
 * the page: "שליחה לאישור" pressed while two dates sit in the picker sent an
 * order without them, and nothing said so (the user, 31/10/2026).
 */
let pending = 0;
const listeners = new Set<() => void>();

export function setPendingLines(n: number) {
  if (n === pending) return;
  pending = n;
  for (const l of listeners) l();
}

export function usePendingLines(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pending,
    () => 0,
  );
}
