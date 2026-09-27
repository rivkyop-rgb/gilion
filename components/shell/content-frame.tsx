"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The frame every internal screen sits in: a readable width and a generous
 * margin — except the placement board, which gets the whole window and a
 * narrow margin (27/09/2026). A printed page is fitted to the room it is left
 * (useFittedSpread), so every pixel of margin here is a pixel off the page.
 */
const EDGE_TO_EDGE = /^\/issues\/[^/]+\/board/;

export function ContentFrame({ children }: { children: React.ReactNode }) {
  const board = EDGE_TO_EDGE.test(usePathname());
  return (
    <div
      className={cn(
        board ? "px-3 py-3 lg:px-4" : "p-4 lg:p-8",
        board ? "max-w-none" : "mx-auto max-w-[1440px]",
      )}
    >
      {children}
    </div>
  );
}
