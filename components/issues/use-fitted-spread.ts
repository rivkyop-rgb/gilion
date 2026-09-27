"use client";

import { useEffect, useRef, useState } from "react";

/** Gap between the two halves of a spread, in pixels. Matches `gap-2`. */
const SPREAD_GAP = 8;

/**
 * The caption row under each page (name, type, how full) — part of the page's
 * own column, so its height comes out of the budget before the page is sized.
 * Without it the page took the whole column and the caption fell below the
 * window, once nothing sat under the spread any more (27/09/2026).
 */
const CAPTION = 22;

/**
 * How big each page of the open view may be, so the whole thing is on screen.
 *
 * ── Why this is measured and not left to CSS ─────────────────────────────────
 * A page has TWO constraints: the height available above the strip, and the
 * width available beside the panels — and which one binds depends on the page
 * size, the number of pages in the view, and how wide the window happens to be.
 * A layout driven by width alone made the board unusable: a newspaper page is
 * tall, so the wider the board got the taller the page became, and collapsing
 * the sidebar to gain room made the page overflow FURTHER. Whatever room is
 * freed has to go into fitting more of the page on screen, not into growing it.
 *
 * So both limits are applied and the smaller one wins. The result is a page
 * that is always whole — no scrolling to see the foot of it, which is where
 * half the ads sit.
 */
export function useFittedSpread(pageCount: number, aspectRatio: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const rect = element.getBoundingClientRect();
      setBox({ width: rect.width, height: rect.height });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // The container's own height comes from the viewport, and a ResizeObserver
    // on it does fire for that — but a browser-chrome change (zoom, a bar
    // appearing) can settle a frame later, so the window is watched too.
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const pages = Math.max(1, pageCount);
  const ratio = aspectRatio > 0 ? aspectRatio : 1;

  const widthBudget = Math.max(0, box.width - SPREAD_GAP * (pages - 1));
  const heightFromWidth = widthBudget / pages / ratio;
  const height = Math.max(0, Math.min(box.height - CAPTION, heightFromWidth));

  return { ref, size: { width: Math.floor(height * ratio), height: Math.floor(height) } };
}
