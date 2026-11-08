import type { Metadata } from "next";
import Link from "next/link";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { businessName, loadSettings } from "@/lib/data/business-settings";
import { textFieldByKey, textFor } from "@/lib/domain/business-settings";
import { MISFIT_FIELDS, WINBACK_FIELDS } from "@/lib/domain/customer-messages";
import { MessageTemplateEditor } from "@/components/settings/message-template-editor";
import { ReminderTemplateEditor } from "../reminders/template-editor";

export const metadata: Metadata = { title: "הודעות ללקוחות · הגדרות · Gilion" };

/**
 * Every message the office sends a customer, in one place (08/11/2026: "נוסח
 * הודעה ללקוח — במסך הגדרות"). Each was editable before, but in three
 * different corners: the reminder on its own screen, the other two as bare
 * boxes among the login-page texts, with their fields named only in a hint.
 * Here each has its fields as buttons and a preview.
 */
export default async function CustomerMessagesPage() {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings", "write");
  const mayEdit = ctx.role === "admin" || ctx.isSuperAdmin;

  const [settings, business] = await Promise.all([
    loadSettings(ctx.businessId),
    businessName(ctx.businessId),
  ]);
  const reminder = textFieldByKey("reminder_template")!;
  const misfit = textFieldByKey("misfit_template")!;
  const winback = textFieldByKey("winback_template")!;
  const phone = settings.contactPhone ?? "";

  return (
    <>
      <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">הודעות ללקוחות</h1>
      <p className="mb-6 max-w-2xl text-sm text-on-surface-variant">
        הנוסחים שנפתחים בוואטסאפ ובמייל כשפונים ללקוח. לחיצה על שדה מכניסה אותו במקום שבו עומד הסמן,
        והוא מתמלא לבד לכל לקוח. <strong>המערכת אינה שולחת דבר בעצמה.</strong>
      </p>

      <div className="max-w-3xl">
        <ReminderTemplateEditor
          current={textFor("reminder_template", settings.texts)}
          fallback={reminder.default}
          maxLength={reminder.maxLength}
        />
        <p className="mb-6 mt-2 text-xs text-on-surface-variant">
          כמה ימים לפני הפרסום מתחילים להזכיר — ב
          <Link href="/settings/reminders" className="text-primary underline">
            הגדרות התזכורות
          </Link>
          .
        </p>

        <MessageTemplateEditor
          templateKey="misfit_template"
          title="קובץ שלא מתאים לגודל שהוזמן"
          hint="נפתח ממסך ״קבצים שלא מתאימים לגודל״"
          fields={MISFIT_FIELDS}
          current={textFor("misfit_template", settings.texts)}
          fallback={misfit.default}
          maxLength={misfit.maxLength}
          mayEdit={mayEdit}
          sample={{
            לקוח: "כהן ובניו",
            עיתון: "מקומון הצפון",
            תאריך: "12.11.2026",
            "גודל שהוזמן": "רבע עמוד",
            מידות: "12.5×18 ס״מ",
            הקובץ: "לרוחב, 20×10 ס״מ",
            "קישור לקובץ": "https://…",
            המלצה: "אפשר לשלוח קובץ חדש בגודל הזה, או לעבור לרצועה — בתוספת ₪120.",
            עסק: business,
            "טלפון העסק": phone,
          }}
        />

        <MessageTemplateEditor
          templateKey="winback_template"
          title="לקוח שפרסם בעבר ולא חזר"
          hint="נפתח מדוחות ← לקוחות לחידוש"
          fields={WINBACK_FIELDS}
          current={textFor("winback_template", settings.texts)}
          fallback={winback.default}
          maxLength={winback.maxLength}
          mayEdit={mayEdit}
          sample={{
            לקוח: "כהן ובניו",
            עיתון: "מקומון הצפון",
            "תאריך אחרון": "14.05.2026",
            גודל: "רבע עמוד",
            עסק: business,
            "טלפון העסק": phone,
          }}
        />
      </div>
    </>
  );
}
