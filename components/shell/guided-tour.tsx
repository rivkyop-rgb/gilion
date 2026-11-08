"use client";

import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { BookOpen, CircleHelp, Compass, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Guidance in the product itself (the user, 03/11/2026: "הדרכה לשימוש במערכת" —
 * a guided tour on the screens plus a help button).
 *
 * A tour is a few bubbles, each pointing at a real control on THIS screen.
 * Targets are found by selector when the step opens; a step whose control is
 * not on the page (no permission, nothing to show yet) is skipped rather than
 * pointing at nothing. The first tour opens by itself, once, the first time the
 * product is opened in this browser; every tour is always one click away on "?".
 */

type Step = { selector: string; title: string; body: string };

const NAV = (href: string) => `[data-testid="sidebar-rail"] a[href="${href}"]`;

type Tour = {
  match: (path: string) => boolean;
  key: string;
  /** The guide's section about this screen (app/(internal)/help). */
  guide?: string;
  steps: Step[];
};

const SEARCH = '[data-testid$="-search"]';
const EXPORT = '[data-testid$="-export"]';

const TOURS: Tour[] = [
  {
    key: "dashboard",
    match: (p) => p === "/dashboard",
    guide: "attention",
    steps: [
      {
        selector: '[data-testid="dashboard-new-order"]',
        title: "הזמנה חדשה",
        body: "כל מכירה מתחילה כאן: בוחרים לקוח, מוסיפים עיתון, גודל ותאריכים, ומאשרים. כל תאריך הופך לפרסום.",
      },
      {
        selector: '[data-testid="dashboard-kpis"]',
        title: "מה קורה השבוע",
        body: "כל מספר כאן הוא קישור — לחיצה פותחת בדיוק את הרשימה שנספרה.",
      },
      {
        selector: NAV("/customers"),
        title: "לקוחות",
        body: "כרטיס לכל לקוח: אנשי קשר, הזמנות, חוב. אפשר גם לייבא רשימת לקוחות מאקסל.",
      },
      {
        selector: NAV("/issues"),
        title: "גיליונות ושיבוץ",
        body: "לכל תאריך של עיתון יש גיליון. שם משבצים את המודעות על העמודים — אוטומטית או ביד — ובסוף סוגרים ומפיקים PDF לדפוס.",
      },
      {
        selector: NAV("/advertisements"),
        title: "מודעות וקבצים",
        body: "כל הקבצים שהלקוחות שלחו. מכאן מחליפים קובץ ורואים לאיזה פרסום הוא שייך.",
      },
      {
        selector: NAV("/billing"),
        title: "גבייה",
        body: "מי חייב כמה, ורישום תשלומים — גם תשלום אחד על כמה חשבונות.",
      },
      {
        selector: '[data-testid="open-command-palette"]',
        title: "חיפוש מהיר",
        body: "Ctrl+K מכל מקום: לקוח, הזמנה או מסך — בהקלדה של כמה אותיות.",
      },
      {
        selector: '[data-testid="help-button"]',
        title: "עזרה",
        body: "הכפתור הזה פותח סיור על המסך שבו את נמצאת, ואת המדריך המלא. אפשר לחזור לכאן תמיד.",
      },
    ],
  },
  {
    key: "order",
    match: (p) => /^\/orders\/c[a-z0-9]+$/.test(p),
    guide: "orders",
    steps: [
      {
        selector: '[data-testid="line-newspaper"]',
        title: "שורת פרסום",
        body: "בוחרים עיתון, סוג עמוד (ברירת המחדל: פנימי) וגודל. המחיר מגיע מהמחירון ואפשר לשנות אותו.",
      },
      {
        selector: '[data-testid="line-position-kind"]',
        title: "מיקום בגיליון",
        body: "עמוד מסוים, אמצע, ימין, שמאל או חצי ראשון/שני — וכמה מותר לזוז. אפשר לשנות לכל תאריך בנפרד.",
      },
      {
        selector: '[data-testid="order-artwork-form"]',
        title: "קובץ המודעה",
        body: "קובץ אחד לכל התאריכים, או לחלק מהם. אפשר גם להחליף קובץ לתאריך אחד בטבלה למטה.",
      },
      {
        selector: '[data-testid="publications-preview"]',
        title: "מה ייווצר",
        body: "שורה לכל תאריך: מחיר, מיקום וקובץ. כאן רואים בדיוק מה יקרה באישור.",
      },
      {
        selector: '[data-testid="order-summary"]',
        title: "סיכום ואישור",
        body: "הסכום, ההנחות והכפתורים לשליחה לאישור ולאישור ההזמנה.",
      },
    ],
  },
  {
    key: "board",
    match: (p) => /^\/issues\/[^/]+\/board$/.test(p),
    guide: "board",
    steps: [
      {
        selector: '[data-testid="unplaced-list"]',
        title: "מה מחכה לשיבוץ",
        body: "כל המודעות של התאריך. לחיצה על מודעה מרימה אותה, והלוח קופץ לעמוד המתאים ומסמן מקום מוצע.",
      },
      {
        selector: '[data-testid^="candidate-expand-"]',
        title: "כל הפרטים",
        body: "החץ פותח את פרטי ההזמנה, ומכאן אפשר לשנות מיקום, גודל (המחיר מתעדכן) או קובץ.",
      },
      {
        selector: '[data-testid="suggestion-bar"], [data-testid="board-bottom-nav"]',
        title: "לשבץ כאן",
        body: 'כשמודעה מורמת, כאן מופיע המקום המוצע וכפתור "לשבץ כאן". אפשר גם ללחוץ על כל מקום אחר בעמוד.',
      },
      {
        selector: '[data-testid="auto-place-header"], [data-testid="auto-place"]',
        title: "שיבוץ אוטומטי",
        body: "משבץ את כל מה שמוכן, לפי המיקום שכל לקוח ביקש. אפשר ללחוץ שוב בכל פעם שמגיעים קבצים חדשים.",
      },
      {
        selector: '[data-testid="board-overview"]',
        title: "כל הגיליון",
        body: "כל העמודים בקטן. לחיצה על עמוד פותחת אותו; כשמודעה מורמת — משבצת אותה בו.",
      },
      {
        selector: '[data-testid="designer-zip"]',
        title: "למי שמשבץ מחוץ למערכת",
        body: "כל הקבצים בקובץ אחד עם רשימת עמודים והערות, או קישור לשליחה לגרפיקאי.",
      },
      {
        selector: '[data-testid="go-to-check"]',
        title: "בדיקה וסגירה",
        body: "בסוף: בדיקה שהכול שובץ, וסגירה שמפיקה PDF לדפוס.",
      },
    ],
  },
  {
    key: "customers",
    match: (p) => p === "/customers",
    guide: "customers",
    steps: [
      {
        selector: '[data-testid="new-customer"]',
        title: "לקוח חדש",
        body: "שם, טלפון או מייל, ואנשי קשר. אם הפרטים כבר קיימים אצל לקוח אחר — תופיע אזהרה כבר בהקלדה.",
      },
      {
        selector: '[data-testid="import-customers"]',
        title: "ייבוא מאקסל",
        body: "מעלים קובץ, רואים כל שורה ומה יקרה איתה, ורק אז מייבאים.",
      },
      {
        selector: SEARCH,
        title: "חיפוש",
        body: "לפי שם, טלפון, מייל או ח.פ. לחיצה על לקוח פותחת את הכרטיס שלו.",
      },
      {
        selector: EXPORT,
        title: "ייצוא",
        body: "הרשימה כפי שהיא מסוננת עכשיו — לקובץ אקסל.",
      },
    ],
  },
  {
    key: "customer-card",
    match: (p) => /^\/customers\/c[a-z0-9]{20,}$/.test(p),
    guide: "customers",
    steps: [
      {
        selector: '[data-testid="customer-new-order"]',
        title: "הזמנה ללקוח הזה",
        body: "פותחת הזמנה חדשה שהלקוח כבר בחור בה.",
      },
      {
        selector: '[data-testid="customer-account"]',
        title: "מצב החשבון",
        body: "כמה פורסם, כמה שולם, כמה פתוח ואם יש זיכוי.",
      },
      {
        selector: '[data-testid="customer-contacts-section"]',
        title: "אנשי קשר",
        body: "מי מקבל תזכורות, גזירים וחשבונות. טלפון פותח וואטסאפ, מייל פותח הודעה.",
      },
      {
        selector: '[data-testid="customer-months-section"]',
        title: "לפי חודשים",
        body: "מה פורסם בכל חודש ומה עוד פתוח עליו.",
      },
    ],
  },
  {
    key: "customer-form",
    match: (p) => p === "/customers/new" || /^\/customers\/[^/]+\/edit$/.test(p),
    guide: "customers",
    steps: [
      {
        selector: "#businessName",
        title: "שם הלקוח",
        body: "השם שיופיע בהזמנות ובחשבונות. אם השם, הטלפון או המייל כבר קיימים אצל לקוח אחר — תופיע אזהרה כבר בהקלדה.",
      },
      {
        selector: '[data-testid="customer-preferred-page"]',
        title: "עמוד קבוע",
        body: "אם הלקוח תמיד מתפרסם בעמוד מסוים — השיבוץ יעדיף אותו.",
      },
      {
        selector: '[data-testid="customer-no-auto-place"]',
        title: "לא לשיבוץ אוטומטי",
        body: "מסמנים כשרוצים לשבץ את הלקוח הזה ביד. השיבוץ האוטומטי ידלג עליו.",
      },
      {
        selector: '[data-testid="contact-add"]',
        title: "אנשי קשר",
        body: "לכל איש קשר מסמנים מה הוא מקבל: תזכורות, גזירים, חוב וגבייה.",
      },
    ],
  },
  {
    key: "customer-import",
    match: (p) => p === "/customers/import",
    guide: "customers",
    steps: [
      {
        selector: '[data-testid="import-template"]',
        title: "קובץ לדוגמה",
        body: "אפשר להתחיל מהקובץ הזה, או להעלות כל אקסל שיש בו שם וטלפון או מייל — העמודות מזוהות לבד.",
      },
      {
        selector: '[data-testid="import-file"]',
        title: "בחירת הקובץ",
        body: "אחרי הבחירה רואים כל שורה ומה יקרה איתה. שום דבר לא נשמר עד הלחיצה על ייבוא.",
      },
    ],
  },
  {
    key: "orders",
    match: (p) => p === "/orders",
    guide: "orders",
    steps: [
      {
        selector: '[data-testid="new-order"]',
        title: "הזמנה חדשה",
        body: "בוחרים לקוח, ואז עיתון, גודל ותאריכים.",
      },
      {
        selector: '[data-testid="status-filters"]',
        title: "סינון לפי מצב",
        body: "טיוטות, ממתינות לאישור, מאושרות. כל צ'יפ מראה כמה יש בו.",
      },
      {
        selector: '[data-testid="portal-filter"]',
        title: "בקשות מהפורטל",
        body: "הזמנות שלקוחות שלחו בעצמם וממתינות לך.",
      },
      { selector: SEARCH, title: "חיפוש", body: "לפי לקוח או מספר הזמנה." },
      { selector: EXPORT, title: "ייצוא", body: "הרשימה המסוננת — לקובץ אקסל." },
    ],
  },
  {
    key: "order-new",
    match: (p) => p === "/orders/new",
    guide: "orders",
    steps: [
      {
        selector: '[data-testid="order-customer"]',
        title: "בחירת לקוח",
        body: "מקלידים כמה אותיות מהשם. לקוח חדש מוסיפים במסך הלקוחות.",
      },
      {
        selector: '[data-testid="create-order"]',
        title: "פתיחת טיוטה",
        body: "ההזמנה נפתחת, ובה מוסיפים עיתון, גודל, תאריכים וקובץ.",
      },
    ],
  },
  {
    key: "issues",
    match: (p) => p === "/issues",
    guide: "board",
    steps: [
      {
        selector: '[data-testid="new-issue"]',
        title: "גיליון חדש",
        body: "בדרך כלל לא צריך: גיליון נפתח לבד כשמאשרים הזמנה לתאריך שלו.",
      },
      {
        selector: '[data-testid="issue-status-filters"]',
        title: "פתוחים וסגורים",
        body: "גיליון פתוח אפשר לשבץ; גיליון סגור כבר ירד לדפוס.",
      },
      {
        selector: '[data-testid="issue-progress"]',
        title: "כמה שובץ",
        body: "כמה מודעות כבר על העמודים מתוך כל מה שנמכר לתאריך. לחיצה על הגיליון פותחת את לוח השיבוץ.",
      },
      {
        selector: '[data-testid="occupancy-link"]',
        title: "תפוסה",
        body: "כמה מקום נשאר בכל גיליון קרוב — לפני שמוכרים.",
      },
      {
        selector: '[data-testid="published-issues-link"]',
        title: "ארכיון",
        body: "גיליונות שיצאו, עם קובץ הדפוס של כל אחד.",
      },
    ],
  },
  {
    key: "issue-check",
    match: (p) => /^\/issues\/[^/]+\/validate$/.test(p),
    guide: "close",
    steps: [
      {
        selector: '[data-testid="blocking-summary"], [data-testid="check-issue-status"]',
        title: "מה בודקים",
        body: "שהכול שובץ, שאין קבצים בעייתיים ושאין חפיפות. אדום עוצר סגירה; כתום רק מתריע.",
      },
      {
        selector: '[data-testid="draft-pdf"]',
        title: "PDF טיוטה",
        body: "לראות איך העיתון ייראה, בלי לסגור כלום.",
      },
      {
        selector: '[data-testid="close-issue"]',
        title: "סגירה",
        body: 'מפיקה את הקובץ לדפוס ומסמנת את הפרסומים כ"פורסמו". אחרי סגירה אי אפשר לשנות.',
      },
    ],
  },
  {
    key: "occupancy",
    match: (p) => p === "/issues/occupancy",
    guide: "board",
    steps: [
      {
        selector: '[data-testid="occupancy-papers"]',
        title: "תפוסת עמודים",
        body: "לכל גיליון קרוב: כמה נמכר בכל סוג עמוד וכמה עוד פנוי.",
      },
    ],
  },
  {
    key: "published",
    match: (p) => p === "/issues/published",
    guide: "close",
    steps: [
      {
        selector: '[data-testid="published-filters"]',
        title: "סינון",
        body: "לפי עיתון, תאריך או לקוח.",
      },
      {
        selector: '[data-testid="published-table"]',
        title: "גיליונות שיצאו",
        body: "לכל גיליון: קובץ הדפוס הסופי להורדה.",
      },
    ],
  },
  {
    key: "advertisements",
    match: (p) => p === "/advertisements",
    steps: [
      {
        selector: '[data-testid="open-upload"]',
        title: "העלאת קובץ",
        body: "מעלים מודעה ובוחרים לקוח ועיתון. הקובץ נבדק מיד מול דרישות הדפוס.",
      },
      {
        selector: '[data-testid="section-attention"]',
        title: "דורש טיפול",
        body: "קבצים שנכשלו בבדיקה או שעוד לא שויכו לפרסום.",
      },
      {
        selector: '[data-testid="filter-status"]',
        title: "סינון",
        body: "לפי מצב, סוג קובץ, עיתון או לקוח. כל בחירה מסננת מיד.",
      },
      {
        selector: '[data-testid="section-recent"]',
        title: "קבצים אחרונים",
        body: "לחיצה על קובץ פותחת אותו: תצוגה, החלפה, ולאיזה פרסום הוא שייך. \"רשימה\" למעלה מציגה את כולם בטבלה.",
      },
      {
        selector: '[data-testid="ads-table"]',
        title: "כל הקבצים",
        body: "לחיצה על קובץ פותחת אותו: תצוגה, החלפה, ולאיזה פרסום הוא שייך.",
      },
    ],
  },
  {
    key: "publications",
    match: (p) => p === "/publications",
    steps: [
      {
        selector: '[data-testid="attention-banner"]',
        title: "מה דורש טיפול",
        body: "פרסומים בלי קובץ, שלא שובצו או שלא שולמו.",
      },
      {
        selector: '[data-testid="status-filters"]',
        title: "סינון לפי מצב",
        body: "כל פרסום הוא תאריך אחד של הזמנה. כאן רואים את כולם לפי מצב.",
      },
      { selector: SEARCH, title: "חיפוש", body: "לפי לקוח או עיתון." },
      { selector: EXPORT, title: "ייצוא", body: "הרשימה המסוננת — לקובץ אקסל." },
    ],
  },
  {
    key: "misfit",
    match: (p) => p === "/publications/misfit",
    guide: "attention",
    steps: [
      {
        selector: '[data-testid^="misfit-advice-"]',
        title: "מה מתאים",
        body: "הגודל שהוזמן, והגודל שמתאים לקובץ ששלחו — עם הפרש המחיר.",
      },
      {
        selector: '[data-testid^="misfit-send-"]',
        title: "הודעה ללקוח",
        body: "לחיצה על וואטסאפ או מייל פותחת הודעה מוכנה: מה הוזמן, מה נשלח, קישור לראות את הקובץ, והמלצה. את הנוסח עורכים בהגדרות ← טקסטים.",
      },
      {
        selector: '[data-testid^="misfit-view-"]',
        title: "מה הלקוח יראה",
        body: "העמוד שנפתח מהקישור: הקובץ שלו בתוך השטח שהזמין.",
      },
    ],
  },
  {
    key: "missed",
    match: (p) => p === "/publications/missed",
    guide: "attention",
    steps: [
      {
        selector: '[data-testid="missed-list"]',
        title: "פרסומים שעבר תאריכם",
        body: "לכל אחד: להעביר לתאריך אחר, או לבטל ולהעביר את מה ששולם לזיכוי.",
      },
    ],
  },
  {
    key: "billing",
    match: (p) => p === "/billing",
    guide: "billing",
    steps: [
      {
        selector: '[data-testid="billing-kpis"]',
        title: "התמונה הכללית",
        body: "כמה חויב, כמה שולם, כמה פתוח וכמה זיכוי.",
      },
      {
        selector: '[data-testid="billing-status-filters"]',
        title: "מי חייב",
        body: "סינון ללקוחות עם חוב, לקוחות ששילמו, וכולם.",
      },
      {
        selector: '[data-testid="billing-table"]',
        title: "רישום תשלום",
        body: '"רישום תשלום" בשורה של לקוח. אפשר לסמן כמה חשבונות — הסכום מתחלק מהישן לחדש.',
      },
    ],
  },
  {
    key: "reminders",
    match: (p) => p === "/reminders",
    steps: [
      {
        selector: '[data-testid="reminders-banner"]',
        title: "איך שולחים",
        body: "לחיצה על וואטסאפ או מייל בשורה פותחת הודעה מוכנה, והתזכורת מסומנת כנשלחה.",
      },
      {
        selector: '[data-testid="reminder-filters"]',
        title: "פתוחות ונשלחו",
        body: "מה עוד צריך לשלוח, ולמי כבר נשלח ומתי.",
      },
      {
        selector: '[data-testid="mark-sent"]',
        title: "טופל בטלפון",
        body: "מי שדיברת איתו בטלפון — מסמנים בתיבה ולוחצים כאן.",
      },
    ],
  },
  {
    key: "reports",
    match: (p) => p === "/reports",
    steps: [
      {
        selector: '[data-testid="report-tabs"]',
        title: "שלושה דוחות",
        body: "תשלומים לפי לקוח, מצב כל פרסום, ולקוחות לחידוש — מי פרסם בתקופה ואפשר לשאול אם ירצה שוב.",
      },
      {
        selector: '[data-testid="period-filters"]',
        title: "תקופה",
        body: "שבוע, חודש או טווח תאריכים. החיצים עוברים לתקופה הקודמת או הבאה.",
      },
      {
        selector: '[data-testid="report-newspaper"]',
        title: "עיתון ולקוח",
        body: 'מצמצמים לעיתון אחד או ללקוח אחד, ולוחצים "הצגה".',
      },
    ],
  },
  {
    key: "newspapers",
    match: (p) => p === "/settings/newspapers",
    guide: "newspaper",
    steps: [
      {
        selector: '[data-testid="new-newspaper"]',
        title: "עיתון חדש",
        body: "גודל עמוד, ימי הדפסה, סוגי עמודים, גדלים ומחירון.",
      },
      {
        selector: '[data-testid="newspaper-cards"]',
        title: "העיתונים",
        body: "לחיצה על עיתון פותחת את ההגדרות שלו.",
      },
    ],
  },
  {
    key: "newspaper",
    match: (p) => /^\/settings\/newspapers\/[^/]+$/.test(p) && p !== "/settings/newspapers/new",
    guide: "newspaper",
    steps: [
      {
        selector: '[data-testid="newspaper-name"]',
        title: "פרטי העיתון",
        body: "שם, גודל עמוד, שוליים וימי הדפסה.",
      },
      {
        selector: '[data-testid="add-page-type"]',
        title: "סוגי עמודים",
        body: "שער, פנימי, גב — ולכל סוג אילו גדלים מותר למכור בו.",
      },
      {
        selector: '[data-testid="auto-place-settings"]',
        title: "שיבוץ אוטומטי",
        body: "באילו סוגי עמודים השיבוץ האוטומטי רשאי להניח מודעות.",
      },
      {
        selector: '[data-testid="reserved-picker"]',
        title: "אזור שמור",
        body: "לוגו או כותרת בראש העמוד — מציירים בגרירה ומעלים תמונה.",
      },
    ],
  },
];

/**
 * Every other screen still has a tour — a short one that says where help is
 * (the user, 03/11/2026: "סיור מודרך בכל עמוד").
 */
const FALLBACK: Tour = {
  key: "page",
  match: () => true,
  steps: [
    {
      selector: "h1",
      title: "המסך הזה",
      body: 'כל פקד כאן מסביר את עצמו בריחוף. למדריך המלא — "עזרה" למעלה.',
    },
    {
      selector: '[data-testid="help-button"]',
      title: "עזרה",
      body: "סיור על המסך שבו את נמצאת, והמדריך המלא לפי סדר העבודה.",
    },
  ],
};

function tourFor(path: string): Tour | null {
  if (path === "/help") return null;
  return TOURS.find((t) => t.match(path)) ?? FALLBACK;
}

const DONE_KEY = (key: string) => `gilion-tour-done-${key}`;
/** Set the first time a tour opened by itself — the only time one does. */
const AUTO_SHOWN_KEY = "gilion-tour-auto-shown";

/** Somebody who finished any tour before the once-only rule has had theirs. */
function autoTourAlreadyShown(): boolean {
  if (window.localStorage.getItem(AUTO_SHOWN_KEY)) return true;
  for (let i = 0; i < window.localStorage.length; i++) {
    if (window.localStorage.key(i)?.startsWith("gilion-tour-done-")) return true;
  }
  return false;
}

// "Start the tour" from the help menu, wherever the tour component is mounted.
const listeners = new Set<() => void>();
let requested = 0;
export function startTour() {
  requested++;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function GuidedTour() {
  const pathname = usePathname();
  const tour = tourFor(pathname);
  const request = useSyncExternalStore(
    subscribe,
    () => requested,
    () => 0,
  );

  // `present` is the steps whose control is on THIS screen, found once when
  // the tour opens; `pos` walks that list. Counting and stepping through the
  // full list is what made the habodek run see "3 מתוך 4" on the first card,
  // a tour that ended after two, and "הקודם" that bounced forward again
  // (08/11/2026).
  const [state, setState] = useState<{
    key: string;
    pos: number;
    present: number[] | null;
    request: number;
  } | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Opened by the help button: adjusted during render, not in an effect.
  const [seenRequest, setSeenRequest] = useState(request);
  if (request !== seenRequest) {
    setSeenRequest(request);
    if (tour) setState({ key: tour.key, pos: 0, present: null, request });
  }

  // Each screen's tour, once, the first time it is seen in this browser.
  // The short fallback tour does not open by itself — it only says where
  // help is, and that is not worth an interruption on every new screen.
  useEffect(() => {
    if (!tour || tour === FALLBACK) return;
    if (window.localStorage.getItem(DONE_KEY(tour.key))) return;
    // Once in all, not once per screen (user, 08/11/2026: "שיקפוץ אוטומטי רק
    // בפעם הראשונה, אחר כך בלחיצה על הסימן שאלה"). A tour on every new
    // screen read as the product interrupting; after the first one, the "?"
    // is where the others are.
    if (autoTourAlreadyShown()) return;
    // Never over an automated browser: an overlay that opens by itself would
    // sit on top of every test's first click.
    if (navigator.webdriver) return;
    const t = window.setTimeout(() => {
      window.localStorage.setItem(AUTO_SHOWN_KEY, "1");
      startTour();
    }, 600);
    return () => window.clearTimeout(t);
  }, [tour]);

  const active = state && tour && state.key === tour.key ? tour : null;
  const steps = active ? active.steps : [];
  const present = active ? state?.present ?? null : null;
  const pos = state?.pos ?? 0;
  const index = present ? (present[pos] ?? -1) : -1;

  const targetOf = useCallback(
    (i: number) => {
      const step = steps[i];
      return step ? document.querySelector<HTMLElement>(step.selector) : null;
    },
    [steps],
  );

  // Skip steps whose control is not on this screen, then measure the target.
  // Done a frame later: the screen has to be there before it can be pointed at.
  useLayoutEffect(() => {
    if (!active) return;
    let measureTimer = 0;
    let target: HTMLElement | null = null;
    const measure = () => {
      if (target) setRect(target.getBoundingClientRect());
    };
    const frame = window.requestAnimationFrame(() => {
      if (!present) {
        const found = steps.map((_, i) => i).filter((i) => targetOf(i));
        if (found.length === 0) return finish();
        return setState((s) => (s ? { ...s, present: found, pos: 0 } : s));
      }
      target = targetOf(index);
      // A control that went away mid-tour: carry on with the next one.
      if (!target) {
        if (pos + 1 >= present.length) return finish();
        return setState((s) => (s ? { ...s, pos: s.pos + 1 } : s));
      }
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
      measure();
      measureTimer = window.setTimeout(measure, 350);
    });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(measureTimer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, present, pos]);

  function finish() {
    if (tour) window.localStorage.setItem(DONE_KEY(tour.key), "1");
    setState(null);
    setRect(null);
  }

  if (!active || !rect || !present || index < 0) return null;
  const step = steps[index]!;
  const below = rect.bottom + 180 < window.innerHeight;
  const width = 300;
  const left = Math.min(
    Math.max(12, rect.left + rect.width / 2 - width / 2),
    window.innerWidth - width - 12,
  );

  return (
    <div className="fixed inset-0 z-[60]" data-testid="guided-tour" dir="rtl">
      <div className="absolute inset-0 bg-primary/30" onClick={finish} />
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-lg ring-4 ring-brand-gold transition-all"
        style={{
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
        }}
      />
      <div
        role="dialog"
        aria-label={step.title}
        className="absolute rounded-xl border border-outline-variant bg-surface-container-lowest p-4 text-sm shadow-elevation-2"
        style={{
          width,
          left,
          ...(below ? { top: rect.bottom + 12 } : { bottom: window.innerHeight - rect.top + 12 }),
        }}
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <p className="font-serif text-base font-semibold">{step.title}</p>
          <button type="button" aria-label="סגירת הסיור" onClick={finish}>
            <X className="size-4 text-on-surface-variant" />
          </button>
        </div>
        <p className="mb-3 text-on-surface-variant">{step.body}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-on-surface-variant">
            {pos + 1} מתוך {present.length}
          </span>
          <span className="flex gap-2">
            {pos > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setState((s) => (s ? { ...s, pos: s.pos - 1 } : s))}
              >
                הקודם
              </Button>
            ) : null}
            <Button
              size="sm"
              data-testid="tour-next"
              onClick={() =>
                pos + 1 >= present.length
                  ? finish()
                  : setState((s) => (s ? { ...s, pos: s.pos + 1 } : s))
              }
            >
              {pos + 1 >= present.length ? "סיום" : "הבא"}
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}

/** The "?" in the top bar: a tour of this screen, and the full guide. */
export function HelpButton() {
  const pathname = usePathname();
  const tour = tourFor(pathname);
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        data-testid="help-button"
        aria-label="עזרה"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container"
      >
        <CircleHelp className="size-4" />
        <span className="hidden sm:inline">עזרה</span>
      </button>
      {open ? (
        <div
          className="absolute start-0 top-full z-50 mt-1 w-56 rounded-lg border border-outline-variant bg-surface-container-lowest p-1 shadow-elevation-2"
          data-testid="help-menu"
        >
          {tour ? (
            <button
              type="button"
              data-testid="help-start-tour"
              onClick={() => {
                setOpen(false);
                startTour();
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm hover:bg-surface-container"
            >
              <Compass className="size-4" /> סיור מודרך במסך הזה
            </button>
          ) : null}
          <Link
            href={tour?.guide ? `/help#${tour.guide}` : "/help"}
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-surface-container"
          >
            <BookOpen className="size-4" /> מדריך שימוש
          </Link>
        </div>
      ) : null}
    </div>
  );
}
