import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { ContentFrame } from "@/components/shell/content-frame";
import { MailClientProvider } from "@/components/mail-client";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { activeMembershipsFor, allBusinessesForSuperAdmin } from "@/lib/auth/memberships";
import { loadOverrides } from "@/lib/data/permissions";
import { loadSettings, mailClient } from "@/lib/data/business-settings";
import { cssVariables } from "@/lib/domain/theme-tokens";
import { brandSrc } from "@/components/brand/brand-mark";
import { SidebarRail } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { CommandPalette } from "@/components/shell/command-palette";
import { IconHints } from "@/components/shell/icon-hints";
import { GuidedTour } from "@/components/shell/guided-tour";
import { MobileTabBar } from "@/components/shell/mobile-tab-bar";
import { effectiveAccess } from "@/lib/domain/permissions";
import type { Area } from "@/lib/auth/rbac";
import { switchBusinessAction, signOutAction } from "./actions";

/**
 * The tab icon follows the business, not the build (stage 11).
 *
 * It has to be resolved per request rather than in the root layout's static
 * `icons`, because which favicon is right depends on which business the session
 * is in — and a super admin switches between them without reloading the app.
 */
export async function generateMetadata(): Promise<Metadata> {
  const session = await auth();
  if (!session?.user?.businessId) return {};
  const settings = await loadSettings(session.user.businessId);
  return { icons: { icon: brandSrc("favicon", settings) } };
}

/**
 * The internal shell (docs/design/app-shell.md).
 *
 * The guards here are belt-and-braces with middleware.ts: middleware runs on
 * the edge and can be bypassed by a mis-scoped matcher, so the layout re-checks
 * before rendering anything (FR-9).
 */
export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.userType === "customer") redirect("/portal");
  if (!session.user.businessId || !session.user.role) redirect("/select-business");

  // A super admin holds no membership rows, so the usual lookup would find no
  // "current" business and bounce them straight back to the picker they just
  // came from — an infinite redirect. Their list is every business instead.
  const isSuperAdmin = session.user.isSuperAdmin === true;
  const memberships = isSuperAdmin
    ? await allBusinessesForSuperAdmin()
    : await activeMembershipsFor(session.user.id);
  const current = memberships.find((m) => m.businessId === session.user.businessId);
  if (!current) redirect("/select-business");

  // The menu is filtered with the same overrides the server guards with, so an
  // item can never appear here while the route rejects it, or the reverse.
  const permissions = await loadOverrides(current.businessId);

  // Stage 11: the admin panel's palette and logo reach the screen from here,
  // and only from here. Every colour token in globals.css is declared
  // `var(--gilion-<name>, <default>)`, so setting the overridden ones on this
  // element repaints the system and setting none falls through to the
  // stylesheet — no rebuild, no deploy, and no conditional anywhere.
  // The same matrix the sidebar and the guards read.
  const mayRead = (area: Area) =>
    isSuperAdmin || effectiveAccess(current.role, area, permissions) !== "none";
  const mayWrite = (area: Area) =>
    isSuperAdmin || effectiveAccess(current.role, area, permissions) === "write";

  const [settings, mail] = await Promise.all([
    loadSettings(current.businessId),
    mailClient(current.businessId),
  ]);

  return (
    <div className="flex min-h-screen bg-surface" style={cssVariables(settings.colors)}>
      {/* The rail owns its own width: it collapses to icons on demand, and by
          itself once the screen is too narrow for a full menu beside the page. */}
      <SidebarRail
        role={current.role}
        isSuperAdmin={isSuperAdmin}
        permissions={permissions}
        brand={{ keys: settings, name: settings.displayName ?? current.businessName }}
      />

      {/* Ctrl+K from anywhere (redesign, 29/09/2026). A way in, not a way
          around: every result is an existing screen, and the server returns
          only what this role may read. */}
      <CommandPalette
        role={current.role}
        isSuperAdmin={isSuperAdmin}
        permissions={permissions}
        mayCreateOrder={mayWrite("orders")}
      />
      <IconHints />
      <GuidedTour />
      <MobileTabBar
        mayCustomers={mayRead("customers")}
        mayCreateOrder={mayWrite("orders")}
        mayBilling={mayRead("billing")}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          userName={session.user.name ?? ""}
          role={current.role}
          isSuperAdmin={isSuperAdmin}
          permissions={permissions}
          current={current}
          options={memberships}
          onSelectBusiness={switchBusinessAction}
          onSignOut={signOutAction}
        />
        {/* Room under the content for the phone's bottom bar. */}
        <main className="flex-1 pb-20 lg:pb-0">
          <ContentFrame>
            <Breadcrumbs />
            <MailClientProvider value={mail}>{children}</MailClientProvider>
          </ContentFrame>
        </main>
      </div>
    </div>
  );
}
