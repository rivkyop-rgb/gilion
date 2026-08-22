import type { Metadata } from "next";
import { signOutAction } from "@/app/(internal)/actions";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "פורטל לקוח · Gilion" };

/**
 * Where a user_type = customer lands (FR-9). The portal itself is stage 09;
 * until then this is an explicit dead end rather than a redirect loop.
 */
export default function PortalOnlyPage() {
  return (
    <>
      <h1 className="mb-2 font-serif text-2xl font-semibold">פורטל הלקוחות עדיין לא זמין</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        החשבון שלך הוא חשבון לקוח, ולכן אין לו גישה למסכי הניהול הפנימיים. פורטל הלקוחות ייפתח בשלב
        מאוחר יותר.
      </p>
      <form action={signOutAction}>
        <Button type="submit" variant="secondary" block>
          יציאה
        </Button>
      </form>
    </>
  );
}
