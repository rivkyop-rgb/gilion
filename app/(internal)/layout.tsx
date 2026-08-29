import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { activeMembershipsFor, allBusinessesForSuperAdmin } from "@/lib/auth/memberships";
import { loadOverrides } from "@/lib/data/permissions";
import { SidebarContent } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { switchBusinessAction, signOutAction } from "./actions";

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
  if (session.user.userType === "customer") redirect("/portal-only");
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

  return (
    <div className="flex min-h-screen bg-surface">
      {/* RTL: border-e is the logical end edge — the sidebar's left in Hebrew. */}
      <aside className="hidden w-70 shrink-0 border-e border-outline-variant bg-surface-container-lowest p-4 lg:block">
        <SidebarContent role={current.role} isSuperAdmin={isSuperAdmin} permissions={permissions} />
      </aside>

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
        <main className="flex-1 p-4 lg:p-8">
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
