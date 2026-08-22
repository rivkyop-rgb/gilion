import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { activeMembershipsFor } from "@/lib/auth/memberships";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/auth/labels";
import { setActiveBusinessAction } from "./actions";

export const metadata: Metadata = { title: "בחירת עסק · Gilion" };

export default async function SelectBusinessPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const memberships = await activeMembershipsFor(session.user.id);

  // A user with no active membership gets a dead end with an explanation,
  // never a redirect loop between /login and /select-business.
  if (memberships.length === 0) {
    return (
      <>
        <h1 className="mb-2 font-serif text-2xl font-semibold">אין לך גישה לאף עסק</h1>
        <p className="text-sm text-on-surface-variant">
          החשבון שלך קיים, אבל הוא לא משויך לאף עסק פעיל. פנו למנהל המערכת כדי שישייך אותך.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-1 font-serif text-2xl font-semibold">בחירת עסק</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        יש לך גישה ליותר מעסק אחד. בחרי עם איזה מהם לעבוד עכשיו.
      </p>

      <ul className="space-y-3">
        {memberships.map((m) => (
          <li key={m.businessId}>
            <form action={setActiveBusinessAction}>
              <input type="hidden" name="businessId" value={m.businessId} />
              <button
                type="submit"
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 text-start transition hover:border-brand-gold hover:shadow-md"
              >
                <span className="flex flex-col gap-1">
                  <span className="text-lg font-semibold text-on-surface">{m.businessName}</span>
                  <Badge className="w-fit">{ROLE_LABELS[m.role]}</Badge>
                </span>
                {/* RTL: ChevronLeft points toward the end of the line in Hebrew */}
                <ChevronLeft className="size-5 shrink-0 text-outline" />
              </button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}
