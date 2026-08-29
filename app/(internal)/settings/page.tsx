import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, Newspaper, Shapes, Users } from "lucide-react";
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
    href: "/settings/ad-shapes",
    icon: Shapes,
    title: "צורות פרסום",
    body: "קטלוג הצורות. משותף לכל העסקים במערכת.",
  },
];

export default async function SettingsPage() {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings");

  return (
    <>
      <h1 className="mb-1 font-serif text-3xl font-semibold">הגדרות</h1>
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
              className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 transition hover:border-brand-gold hover:shadow-md"
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
