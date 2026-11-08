import type { Metadata } from "next";
import Link from "next/link";
import {
  BellRing,
  Building2,
  Globe,
  KeyRound,
  Newspaper,
  Palette,
  Shapes,
  Type,
  Users,
  ClipboardCheck,
} from "lucide-react";
import { getTenantContext, requireArea } from "@/lib/auth/tenant";

export const metadata: Metadata = { title: "הגדרות · Gilion" };

const SECTIONS = [
  {
    href: "/settings/users",
    icon: Users,
    title: "משתמשים",
    body: "מי יכול להיכנס לעסק, באיזה תפקיד, ומי כבר לא.",
  },
  {
    href: "/settings/permissions",
    icon: KeyRound,
    title: "הרשאות תפקידים",
    body: "מה כל תפקיד יכול לראות ולערוך. ברירות המחדל ניתנות לשינוי לעסק שלך.",
  },
  {
    href: "/settings/newspapers",
    icon: Newspaper,
    title: "עיתונים",
    body: "גודל עמוד, שוליים, חלוקת העמוד לגריד, סוגי עמודים, צורות פרסום ומחירון.",
  },
  {
    href: "/settings/orders",
    icon: ClipboardCheck,
    title: "תהליך הזמנות",
    body: "האם הזמנה שמוזנת במשרד מאושרת ישירות או ממתינה לאישור נפרד.",
  },
  {
    href: "/settings/reminders",
    icon: BellRing,
    title: "תזכורות",
    body: "כמה ימים לפני הפרסום להתחיל להזכיר, ונוסח התזכורת שנפתח בוואטסאפ ובמייל.",
  },
  {
    href: "/settings/ad-shapes",
    icon: Shapes,
    title: "צורות פרסום",
    body: "הגדלים שנמכרים בכל עיתון: חצי עמוד, רבע, רצועה ועוד.",
  },
  // Stage 11 — the admin panel. Everything below is changed by an admin
  // without a developer and without a deploy.
  {
    href: "/settings/branding",
    icon: Building2,
    title: "מותג",
    body: "לוגו, סימן ו־favicon, שם תצוגה ומשפט מלווה. מופיעים בסרגל הצד, בלשונית ובמסך ההתחברות.",
  },
  {
    href: "/settings/theme",
    icon: Palette,
    title: "צבעים",
    body: "צבעי המותג וחמשת צבעי הסטטוס, עם תצוגה מקדימה חיה. נכנס לתוקף מיד, בלי גרסה חדשה.",
  },
  {
    href: "/settings/texts",
    icon: Type,
    title: "טקסטים",
    body: "המשפטים שהמשתמשים והלקוחות קוראים — מסך ההתחברות, הפורטל, תחתית ה־PDF ונוסח התזכורת.",
  },
  {
    href: "/settings/general",
    icon: Globe,
    title: "כללי",
    body: "פרטי התקשרות, קישור לפורטל הלקוחות ותוכנת המייל.",
  },
];

export default async function SettingsPage() {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings");

  return (
    <>
      <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">הגדרות</h1>
      <p className="mb-8 text-sm text-on-surface-variant">
        מה שמוגדר כאן קובע מה מותר לשבץ, איפה, ובכמה.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 transition hover:border-brand-gold hover:shadow-elevation-1"
            >
              <Icon className="mb-3 size-6 text-primary-container" />
              <h2 className="mb-1 font-serif text-xl font-semibold">{s.title}</h2>
              <p className="text-sm text-on-surface-variant">{s.body}</p>
            </Link>
          );
        })}
      </div>
    </>
  );
}
