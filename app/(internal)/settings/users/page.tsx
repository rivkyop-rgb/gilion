import type { Metadata } from "next";
import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { listMembers } from "@/lib/data/team";
import { Badge } from "@/components/ui/badge";
import { Ltr } from "@/components/ui/ltr";
import { ROLE_LABELS } from "@/lib/auth/labels";
import type { AssignableRole } from "@/lib/domain/team";
import { formatDate } from "../../orders/format";
import { AddMemberForm } from "./add-member-form";
import { ResetPasswordDialog } from "@/components/account/reset-password-dialog";
import { resetMemberPasswordAction } from "./actions";
import { AccessButton, RoleSelect } from "./member-controls";

export const metadata: Metadata = { title: "משתמשים · Gilion" };

export default async function UsersPage() {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings", "write");

  const members = await listMembers(ctx.businessId);
  const activeAdmins = members.filter((m) => m.status === "active" && m.role === "admin").length;

  return (
    <>
      <h1 className="mb-1 font-serif text-3xl font-semibold">משתמשים</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        האנשים שיכולים להיכנס לעסק הזה. משתמש שייך לעסק אחד בלבד, ואינו רואה שום נתון מעסק אחר.
      </p>

      <AddMemberForm />

      <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
        <table className="w-full text-sm" data-testid="members-table">
          <thead className="bg-surface-container">
            <tr>
              <th className="p-3 text-start font-semibold">שם</th>
              <th className="p-3 text-start font-semibold">מייל</th>
              <th className="p-3 text-start font-semibold">תפקיד</th>
              <th className="p-3 text-start font-semibold">מצב</th>
              <th className="p-3 text-start font-semibold">נוסף</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isSelf = m.user.id === ctx.userId;
              const active = m.status === "active";
              return (
                <tr
                  key={m.id}
                  data-testid={`member-row-${m.user.id}`}
                  className={
                    active
                      ? "border-t border-outline-variant"
                      : "border-t border-outline-variant opacity-60"
                  }
                >
                  <td className="p-3">
                    {m.user.name}
                    {isSelf ? (
                      <span className="ms-2 text-xs text-on-surface-variant">(את)</span>
                    ) : null}
                  </td>
                  <td className="p-3">
                    <Ltr>{m.user.email}</Ltr>
                  </td>
                  <td className="p-3">
                    {/* Your own role and the last admin's are shown, not offered:
                        both changes are refused by the server anyway, and a
                        control that always fails is worse than none. */}
                    <RoleSelect
                      userId={m.user.id}
                      role={m.role as AssignableRole}
                      disabled={isSelf || (m.role === "admin" && active && activeAdmins === 1)}
                    />
                  </td>
                  <td className="p-3">
                    <Badge tone={active ? "success" : "muted"}>{active ? "פעיל" : "מושבת"}</Badge>
                  </td>
                  <td className="p-3">
                    <Ltr>{formatDate(m.created_at)}</Ltr>
                  </td>
                  <td className="whitespace-nowrap p-3 text-end">
                    {/*
                     * Two controls, and the rules that guard the left one do
                     * not apply to the right one: "you cannot remove your own
                     * access" and "this is the last admin" are about who can
                     * still get in, and neither is a reason to refuse anyone a
                     * new password.
                     */}
                    <span className="flex items-center justify-end gap-2">
                      {isSelf || (m.role === "admin" && active && activeAdmins === 1) ? (
                        <span className="text-xs text-on-surface-variant">
                          {isSelf ? "לא ניתן להסיר את עצמך" : "המנהל הפעיל האחרון"}
                        </span>
                      ) : (
                        <AccessButton userId={m.user.id} name={m.user.name} active={active} />
                      )}
                      <ResetPasswordDialog
                        userId={m.user.id}
                        name={m.user.name}
                        onReset={resetMemberPasswordAction}
                        testId={`reset-password-${m.user.id}`}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-on-surface-variant">
        הסרת גישה אינה מוחקת את החשבון: המשתמש נשאר על כל ההזמנות שאישר ובלוג הביקורת, ואפשר להחזיר
        לו גישה בכל רגע. &quot;כבר לא עובד כאן&quot; ו&quot;מעולם לא היה&quot; אינם אותו דבר.
      </p>
    </>
  );
}
