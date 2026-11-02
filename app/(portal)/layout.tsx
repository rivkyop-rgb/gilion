import type { Metadata } from "next";
import { IconHints } from "@/components/shell/icon-hints";
import { LogOut, Newspaper } from "lucide-react";

import { auth } from "@/lib/auth/config";
import { getCustomerScope, NotCustomerError } from "@/lib/auth/portal";
import { businessName, loadSettings } from "@/lib/data/business-settings";
import { portalGreeting } from "@/lib/data/portal";
import { cssVariables } from "@/lib/domain/theme-tokens";
import { BrandMark, brandSrc, hasCustomBrand } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { PortalNav } from "@/components/portal/portal-nav";
import { portalSignOutAction } from "./portal/actions";

export async function generateMetadata(): Promise<Metadata> {
  const session = await auth();
  if (!session?.user?.businessId) return { title: "פורטל לקוח · Gilion" };
  const settings = await loadSettings(session.user.businessId);
  return { title: "פורטל לקוח · Gilion", icons: { icon: brandSrc("favicon", settings) } };
}

/**
 * The customer portal's shell (docs/design/app-shell.md §4).
 *
 * Nothing from the internal shell is imported here — no sidebar, no business
 * switcher, no navigation. That is FR-9 made visible: there is no link to an
 * internal screen because there is nowhere in this tree to put one.
 *
 * The guard is repeated here, behind middleware.ts, for the same reason the
 * internal layout repeats its own: a tenancy hole must not depend on one regex.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  let scope;
  try {
    scope = await getCustomerScope();
  } catch (e) {
    if (!(e instanceof NotCustomerError)) throw e;
    return <Unlinked />;
  }

  // Stage 11's branding reaches the portal the same way it reaches the
  // internal shell: the business's colour overrides on the outermost element.
  const [settings, name, greeting] = await Promise.all([
    loadSettings(scope.businessId),
    businessName(scope.businessId),
    portalGreeting(scope),
  ]);
  const brandName = settings.displayName ?? name;

  return (
    <div className="min-h-screen bg-surface" style={cssVariables(settings.colors)}>
      <header className="border-b border-outline-variant bg-surface-container-lowest">
        <div className="mx-auto flex h-14 max-w-[720px] items-center justify-between gap-4 px-4">
          <span className="flex min-w-0 items-center gap-2">
            {hasCustomBrand("mark", settings) ? (
              <BrandMark slot="mark" keys={settings} width={28} height={28} className="size-7" />
            ) : (
              <Newspaper className="size-5 text-primary" aria-hidden />
            )}
            <span data-testid="portal-brand" className="truncate font-serif text-lg font-semibold">
              {brandName}
            </span>
          </span>

          <span className="flex items-center gap-3">
            <span data-testid="portal-greeting" className="text-sm text-on-surface-variant">
              שלום, {greeting.userName}
            </span>
            <form action={portalSignOutAction}>
              <Button type="submit" variant="ghost" size="sm" aria-label="יציאה">
                <LogOut className="size-4" />
                <span className="hidden sm:inline">יציאה</span>
              </Button>
            </form>
          </span>
        </div>
        <div className="mx-auto max-w-[720px] px-4 pb-2">
          <PortalNav />
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-4 py-10">{children}</main>
      <IconHints />
    </div>
  );
}

/**
 * A portal account with no customer behind it — or one bound to several
 * businesses, which leaves no single answer to "whose requests". Not a
 * redirect: every door would send them back here, and a loop explains nothing.
 */
function Unlinked() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div className="w-full max-w-md rounded-xl border border-outline-variant bg-surface-container-lowest p-8">
        <h1 className="mb-2 font-serif text-2xl font-semibold">החשבון עדיין לא משויך ללקוח</h1>
        <p className="mb-6 text-sm text-on-surface-variant">
          כדי להגיש בקשות פרסום, העיתון צריך לשייך את החשבון שלך לכרטיס הלקוח שלך. אפשר לפנות לעיתון
          ולבקש זאת.
        </p>
        <form action={portalSignOutAction}>
          <Button type="submit" variant="secondary" block>
            יציאה
          </Button>
        </form>
      </div>
    </div>
  );
}
