"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A small explanation bubble over every icon that has no words of its own
 * (the user, 31/10/2026: "on every icon, a small window with an explanation").
 *
 * One listener for the whole app rather than a wrapper per icon: the name is
 * already there — every icon-only control carries an `aria-label` (or a
 * `title`) for screen readers — so the bubble shows that same text, and an
 * icon added tomorrow gets one without anybody remembering to.
 *
 * Only for elements with no visible text: a button that already says
 * "שמירה" does not need a bubble repeating it. A native `title` is parked in
 * `data-hint` while the bubble shows, so the browser does not draw a second,
 * slower tooltip on top of it.
 */
export function IconHints() {
  const [hint, setHint] = useState<{ text: string; x: number; y: number; below: boolean } | null>(
    null,
  );
  const current = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const textOf = (el: HTMLElement) =>
      el.getAttribute("data-hint") || el.getAttribute("title") || el.getAttribute("aria-label");

    const findTarget = (from: EventTarget | null): HTMLElement | null => {
      let el = from instanceof Element ? (from as HTMLElement) : null;
      for (let depth = 0; el && depth < 4; depth++, el = el.parentElement) {
        if (el.hasAttribute("data-no-hint")) return null;
        const text = textOf(el);
        if (text && !el.innerText?.trim()) return el;
        // Stop at the first control: its label is the one that means something.
        if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return null;
      }
      return null;
    };

    const show = (el: HTMLElement) => {
      const text = textOf(el);
      if (!text) return;
      if (el.hasAttribute("title")) {
        el.setAttribute("data-hint", el.getAttribute("title")!);
        el.removeAttribute("title");
      }
      const r = el.getBoundingClientRect();
      const below = r.top < 48;
      setHint({ text, x: r.left + r.width / 2, y: below ? r.bottom + 6 : r.top - 6, below });
    };

    const hide = () => {
      window.clearTimeout(timer.current);
      current.current = null;
      setHint(null);
    };

    const onOver = (e: Event) => {
      const el = findTarget(e.target);
      if (el === current.current) return;
      hide();
      if (!el) return;
      current.current = el;
      // Short delay so sweeping the mouse across a row does not flash bubbles.
      timer.current = window.setTimeout(() => show(el), e.type === "focusin" ? 0 : 350);
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("focusin", onOver);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("keydown", hide);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("focusin", onOver);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("keydown", hide);
      window.clearTimeout(timer.current);
    };
  }, []);

  if (!hint) return null;
  return (
    <div
      role="tooltip"
      data-testid="icon-hint"
      style={{
        position: "fixed",
        left: hint.x,
        top: hint.y,
        transform: `translate(-50%, ${hint.below ? "0" : "-100%"})`,
      }}
      className="pointer-events-none z-[60] max-w-64 rounded-md bg-inverse-surface px-2.5 py-1.5 text-xs text-inverse-on-surface shadow-elevation-2"
    >
      {hint.text}
    </div>
  );
}
