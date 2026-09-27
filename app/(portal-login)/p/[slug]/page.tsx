import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { portalBusiness } from "@/lib/data/portal-link";
import { portalUrl } from "@/lib/portal-origin";
import { textFor } from "@/lib/domain/business-settings";
import { cssVariables } from "@/lib/domain/theme-tokens";
import { LoginForm } from "@/app/(auth)/login/login-form";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const business = await portalBusiness(slug);
  if (!business) return { title: "כניסת לקוחות · Gilion" };
  const name = business.settings.displayName ?? business.name;
  const favicon = business.settings.faviconFileKey;

  // The card WhatsApp (and most messengers) draw under a link to this page:
  // the business's name and its logo. A message opened from a link can carry
  // text only, so this is how a reminder that includes {קישור לפורטל} reaches
  // the customer with the logo on it (27/09/2026). Absolute URLs — the
  // messenger's server fetches them, not the browser.
  const url = await portalUrl(business.slug);
  const origin = new URL(url).origin;
  const logo = business.settings.logoFullFileKey ?? business.settings.markFileKey;
  const image = logo
    ? `${origin}/api/files/${logo}?portal=${business.slug}`
    : `${origin}/brand/logo-full.png`;
  const description = business.settings.tagline ?? "העלאת קובץ מודעה ומעקב אחרי ההזמנות שלך";

  return {
    title: `כניסת לקוחות · ${name}`,
    description,
    ...(favicon ? { icons: { icon: `/api/files/${favicon}?portal=${business.slug}` } } : {}),
    openGraph: {
      type: "website",
      url,
      siteName: name,
      title: name,
      description,
      locale: "he_IL",
      images: [{ url: image, alt: name }],
    },
    twitter: { card: "summary", title: name, description, images: [image] },
  };
}

/**
 * One business's portal door (backlog 21).
 *
 * It knows whose logo to show before anyone signs in, which the shared
 * /portal/login cannot once an installation holds two businesses — and the
 * sign-in it submits is bound to this business, so an address that is a
 * customer of two newspapers lands in the one whose link it followed.
 *
 * Brand files are requested with `?portal=<slug>`: the file route serves a
 * signed-out visitor exactly this business's current brand keys and nothing
 * else (app/api/files).
 */
export default async function BusinessPortalLoginPage({ params }: Props) {
  const { slug } = await params;
  const business = await portalBusiness(slug);
  if (!business) notFound();

  const { settings } = business;
  const name = settings.displayName ?? business.name;
  const mark = settings.markFileKey;

  return (
    <div style={cssVariables(settings.colors)} className="contents">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        {mark ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/files/${mark}?portal=${business.slug}`}
            alt=""
            width={56}
            height={56}
            className="size-14 object-contain"
            data-testid="portal-login-mark"
          />
        ) : null}
        <p
          data-testid="portal-login-brand"
          className="font-serif text-xl font-semibold text-primary"
        >
          {name}
        </p>
      </div>
      <h1 className="mb-1 font-serif text-2xl font-semibold">כניסת לקוחות</h1>
      <p className="mb-6 whitespace-pre-line text-sm text-on-surface-variant">
        {textFor("portal_intro", settings.texts)}
      </p>
      <LoginForm portal={business.slug} />
      <p className="mt-6 text-center text-xs text-on-surface-variant">
        עובדים ב{name}?{" "}
        <Link href="/login" className="text-primary underline">
          כניסת צוות
        </Link>
      </p>
    </div>
  );
}
