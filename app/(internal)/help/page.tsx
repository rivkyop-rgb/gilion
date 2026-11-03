import type { Metadata } from "next";
import Link from "next/link";

import { getTenantContext } from "@/lib/auth/tenant";

export const metadata: Metadata = { title: "מדריך שימוש · Gilion" };

/**
 * The user guide (the user, 03/11/2026: "הדרכה לשימוש במערכת"). Written in the
 * order the work is done: set the newspaper up once, then customers, orders,
 * files, placement, closing and money. Every step links to the screen it is
 * about. The guided tour on each screen points at the same controls.
 */
const SECTIONS: Array<{
  id: string;
  title: string;
  intro: string;
  steps: string[];
  link?: { href: string; label: string };
}> = [
  {
    id: "newspaper",
    title: "1. הגדרת עיתון (פעם אחת)",
    intro: "לפני הכול — איך נראה העיתון: גודל העמוד, אילו גדלי מודעות נמכרים, ומה המחיר של כל אחד.",
    steps: [
      "בהגדרות → עיתונים פותחים עיתון ובוחרים גודל עמוד (רוב המקומונים: טאבלויד) וימי הדפסה.",
      "סוגי עמודים: שער, פנימי, גב. לכל סוג מסמנים אילו גדלים מותר למכור בו.",
      "אזור שמור: הלוגו או הכותרת שבראש העמוד — מציירים בגרירה ומעלים תמונה.",
      "צורות פרסום: הגדלים שנמכרים (עמוד, חצי, רבע…). אחרי שמוסיפים צורה — קובעים לה מחיר בלשונית המחירון.",
    ],
    link: { href: "/settings/newspapers", label: "להגדרות העיתונים" },
  },
  {
    id: "customers",
    title: "2. לקוחות",
    intro: "כרטיס לכל מפרסם, עם אנשי הקשר שלו.",
    steps: [
      "לקוח חדש: שם, טלפון או מייל. אם הפרטים כבר קיימים אצל לקוח אחר — תופיע אזהרה כבר בהקלדה, ואפשר לאשר בלחיצה.",
      "לכל איש קשר מסמנים מה הוא מקבל: תזכורות, גזירים, חוב וגבייה.",
      "עמוד קבוע: אם הלקוח תמיד בעמוד מסוים. \"לא לשיבוץ אוטומטי\": אם את מעדיפה לשבץ אותו ביד.",
      "יש רשימה קיימת? \"ייבוא מאקסל\" במסך הלקוחות — רואים כל שורה לפני שמייבאים.",
    ],
    link: { href: "/customers", label: "ללקוחות" },
  },
  {
    id: "orders",
    title: "3. הזמנה",
    intro: "מה הלקוח קנה: איזה עיתון, איזה גודל, באילו תאריכים ואיפה בגיליון.",
    steps: [
      "הזמנה חדשה → בוחרים לקוח → \"פתיחת טיוטה\".",
      "בשורת הפרסום: עיתון, סוג עמוד (ברירת המחדל: פנימי), גודל ותאריכים. המחיר מגיע מהמחירון.",
      "מיקום בגיליון: עמוד מסוים (קבוע או עם גמישות), אמצע, ימין, שמאל, חצי ראשון או שני — והערה למשבץ. אפשר לשנות לכל תאריך בנפרד.",
      "קובץ המודעה: אחד לכל התאריכים, או קובץ שונה לתאריך מסוים — בטבלה \"תצוגה מקדימה\".",
      "אישור ההזמנה יוצר פרסום לכל תאריך. אחרי האישור המערכת מציעה: הזמנה נוספת, כל ההזמנות של הלקוח, או רישום תשלום.",
    ],
    link: { href: "/orders/new", label: "להזמנה חדשה" },
  },
  {
    id: "board",
    title: "4. שיבוץ בגיליון",
    intro: "לכל תאריך של עיתון יש גיליון. שם מניחים את המודעות על העמודים.",
    steps: [
      "גיליונות ושיבוץ → פותחים את הגיליון של התאריך.",
      "שיבוץ אוטומטי: משבץ את כל מה שמוכן לפי המיקום שכל לקוח ביקש — מי שביקש עמוד קבוע מקבל אותו ראשון. אפשר ללחוץ שוב כשמגיעים קבצים חדשים.",
      "שיבוץ ידני: לוחצים על מודעה ברשימה — הלוח עובר לעמוד המתאים ומסמן \"מקום מוצע\". \"לשבץ כאן\" מניח אותה, או לוחצים על מקום אחר בעמוד.",
      "החץ ליד כל מודעה פותח את כל הפרטים, ומשם משנים מיקום, גודל (המחיר מתעדכן לפי המחירון) או קובץ.",
      "\"כל הגיליון\" מציג את כל העמודים בקטן. צבעים: ירוק מוכן, כתום חסר קובץ או ממתין, אדום בעיה.",
      "מישהו משבץ מחוץ למערכת? \"קבצים למשבץ\" מוריד את כל הקבצים עם רשימה, ו\"קישור לגרפיקאי\" מעתיק קישור לשליחה.",
    ],
    link: { href: "/issues", label: "לגיליונות" },
  },
  {
    id: "close",
    title: "5. בדיקה וסגירה",
    intro: "לפני שהעיתון יורד לדפוס.",
    steps: [
      "\"בדיקה וסגירה\" בלוח השיבוץ: המערכת בודקת שהכול שובץ ושאין קבצים בעייתיים.",
      "אין צורך לשנות סטטוס ביד: גיליון עובר ל\"בעבודה\" לבד כשמשבצים בו את המודעה הראשונה.",
      "סגירה מפיקה PDF לדפוס ומסמנת את הפרסומים כ\"פורסמו\". גיליון סגור עובר לארכיון.",
    ],
  },
  {
    id: "attention",
    title: "6. מה דורש תשומת לב",
    intro: "לוח הבקרה מתריע על מה שצריך טיפול:",
    steps: [
      "פרסומים שעבר תאריכם ולא פורסמו — להעביר לתאריך אחר או לזכות את הלקוח.",
      "קבצים שלא מתאימים לגודל שנמכר — במסך שלהם רואים איזה גודל כן מתאים לקובץ ובכמה, ולחיצה על וואטסאפ או מייל שולחת ללקוח הודעה מוכנה עם קישור לראות את הקובץ שלו בשטח שהזמין.",
      "פרסומים בלי קובץ — תזכורות ללקוחות: לחיצה על וואטסאפ או מייל פותחת הודעה מוכנה, והתזכורת מסומנת כנשלחה.",
    ],
    link: { href: "/dashboard", label: "ללוח הבקרה" },
  },
  {
    id: "billing",
    title: "7. גבייה ודוחות",
    intro: "מי חייב וכמה, ומי כדאי שיחזור.",
    steps: [
      "גבייה ותשלומים → \"רישום תשלום\" ללקוח. אפשר לסמן כמה חשבונות — הסכום מתחלק מהישן לחדש, ועודף נכנס לזיכוי.",
      "בכרטיס הלקוח רואים חוב לפי חודשים.",
      "דוחות ← \"לקוחות לחידוש\": מי פרסם בתקופה שבוחרים (למשל אותה עונה בשנה שעברה), עם הודעה מוכנה לשאול אם ירצה לפרסם שוב. מי שכבר הזמין שוב לא מוצג.",
    ],
    link: { href: "/billing", label: "לגבייה" },
  },
];

export default async function HelpPage() {
  await getTenantContext();
  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">מדריך שימוש</h1>
      <p className="mb-4 text-sm text-on-surface-variant">
        לפי סדר העבודה. בכל מסך אפשר גם ללחוץ על &quot;עזרה&quot; למעלה → &quot;סיור מודרך במסך
        הזה&quot;.
      </p>
      <nav className="mb-8 flex flex-wrap gap-2" aria-label="פרקי המדריך">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full border border-outline-variant px-3 py-1 text-xs hover:bg-surface-container"
          >
            {s.title}
          </a>
        ))}
      </nav>
      <div className="space-y-6">
        {SECTIONS.map((s) => (
          <section
            key={s.id}
            id={s.id}
            data-testid={`help-${s.id}`}
            className="scroll-mt-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-elevation-1"
          >
            <h2 className="mb-1 font-serif text-xl font-semibold">{s.title}</h2>
            <p className="mb-3 text-sm text-on-surface-variant">{s.intro}</p>
            <ol className="list-inside list-decimal space-y-1.5 text-sm">
              {s.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {s.link ? (
              <Link href={s.link.href} className="mt-3 inline-block text-sm text-primary underline">
                {s.link.label} ←
              </Link>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
