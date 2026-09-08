/**
 * The one place in the product that knows where a logo comes from (stage 11).
 *
 * Every other component renders <BrandMark /> and passes nothing but a slot and
 * the settings the layout already loaded. That indirection is the whole feature:
 * replacing a logo has to be a minute of an admin's time, and it stops being
 * that the moment a second component hardcodes a path. An ESLint rule keeps
 * `/brand/…` literals out of everything except this file.
 */
import type { BrandSlot } from "@/lib/domain/business-settings";
import { cn } from "@/lib/utils";

/** What ships in public/brand/ and what every business sees until it uploads. */
export const DEFAULT_BRAND: Record<BrandSlot, string> = {
  mark: "/brand/logo-mark.png",
  logo_full: "/brand/logo-full.png",
  favicon: "/brand/favicon.svg",
};

/** The three keys a settings row can hold, in the shape the layout passes down. */
export type BrandKeys = {
  markFileKey?: string | null;
  logoFullFileKey?: string | null;
  faviconFileKey?: string | null;
};

const SLOT_KEY: Record<BrandSlot, keyof BrandKeys> = {
  mark: "markFileKey",
  logo_full: "logoFullFileKey",
  favicon: "faviconFileKey",
};

/**
 * The URL to render for a slot: the business's upload, or the shipped file.
 *
 * An uploaded asset is served by app/api/files/[...key], never from the object
 * store directly (conventions.md §5) — and never as a presigned link, for the
 * reason written at the top of that route.
 */
export function brandSrc(slot: BrandSlot, keys: BrandKeys | null | undefined): string {
  const key = keys?.[SLOT_KEY[slot]];
  return key ? `/api/files/${key}` : DEFAULT_BRAND[slot];
}

/** True when this business has replaced the shipped file for that slot. */
export function hasCustomBrand(slot: BrandSlot, keys: BrandKeys | null | undefined): boolean {
  return Boolean(keys?.[SLOT_KEY[slot]]);
}

export function BrandMark({
  slot = "mark",
  keys,
  alt = "",
  className,
  width,
  height,
}: {
  slot?: BrandSlot;
  keys?: BrandKeys | null;
  alt?: string;
  className?: string;
  width?: number;
  height?: number;
}) {
  /*
    A plain <img>, not next/image, and for two reasons that both matter here:

      1. An uploaded logo may be an SVG, and the image optimiser refuses SVG
         unless `dangerouslyAllowSVG` is turned on globally — which would apply
         to every image in the product, not only this one.
      2. <img> is what makes an SVG logo inert. A browser does not run script
         inside an SVG loaded this way, which is the second and stronger half of
         the defence in lib/domain/svg-sanitize.ts.

    There is nothing to optimise anyway: the file is a logo, it is already the
    size it renders at, and the route sets a private cache header.
  */
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={brandSrc(slot, keys)}
      alt={alt}
      width={width}
      height={height}
      className={cn("object-contain", className)}
    />
  );
}
