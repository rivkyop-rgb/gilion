# שלב 00 — Foundation

## מטרה

בסוף השלב קיים פרויקט Next.js שרץ, מתחבר ל־Postgres, מרנדר עמוד עברי RTL עם הפונטים והטוקנים הנכונים, ויש לו צנרת בדיקות שעוברת ב־CI — בלי אף פיצ'ר עסקי.

## תלויות

אין. זה השלב הראשון.

## מקורות באפיון

[`../stack.md`](../stack.md) · [`conventions.md`](conventions.md) §1, §9 · [`../design/design-system.md`](../design/design-system.md)

## Scope

**נכנס:** scaffold של Next.js 16 + React 19 + TypeScript · Tailwind + shadcn/ui עם טוקני העיצוב · הגדרת RTL ופונטים עבריים · Prisma + Postgres 18 · Docker Compose לפיתוח (Postgres + MinIO) · Vitest + Playwright · ESLint/Prettier כולל הכללים המותאמים · מבנה התיקיות מ־`conventions.md` §9 · assets המותג.

**לא נכנס:** שום מודל Prisma עסקי (השלב מסתפק במיגרציה ריקה שמאמתת חיבור) · שום מסך עם נתונים · Auth · Deployment לפרודקשן.

## מודל נתונים

אין ישויות. הוגדרו:

- `prisma/schema.prisma` עם `datasource db` ל־Postgres ו־`generator client`.
- מיגרציה ראשונה `0000_init` — ריקה, מטרתה לאמת שהצנרת עובדת מקצה לקצה.
- קונבנציות שנקבעות עכשיו ותקפות לכל המודלים הבאים: `id` הוא `String @id @default(cuid())` · `created_at`/`updated_at` בכל מודל · `@@map` לשמות טבלאות ב־PascalCase כמו ב־ERD · enums של Prisma לכל enum מה־ERD.

## מסלולים ופעולות

- `app/layout.tsx` — root layout עם `<html dir="rtl" lang="he">`, שלושת הפונטים דרך `next/font/google`, ו־`<body>` עם טוקני הצבע.
- `app/page.tsx` — עמוד בדיקה זמני שמציג את סקאלת הטיפוגרפיה, את פלטת הצבעים ואת הלוגו. **נמחק בשלב 01.**
- `lib/db.ts` — יצוא ה־Prisma client. בשלב 01 יוחלף ב־client מורחב.
- `docker-compose.dev.yml` — Postgres 18 + MinIO, עם volumes מתמידים.

## מסכים

עמוד `/` זמני בלבד — "דף טוקנים". הוא מוודא ויזואלית ששלושת הפונטים נטענים עם גליפים עבריים, שהצבעים נכונים, ושהכיוון RTL.

## הרשאות

אין. אין Auth בשלב הזה.

## כללי ולידציה

אין ולידציה עסקית. מה שכן נאכף:

- **TypeScript ב־`strict`**, כולל `noUncheckedIndexedAccess`.
- **ESLint חוסם `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`** ב־className (`conventions.md` §1). הכלל נכתב עכשיו כי אחר כך מאוחר מדי.
- **ESLint חוסם ייבוא `@prisma/client` מחוץ ל־`lib/data/`** (`conventions.md` §2). גם הוא נכתב עכשיו, גם אם `lib/data/` עדיין כמעט ריק.
- Prettier עם `printWidth: 100`.

## עיצוב ומותג

מהעיצוב ([`../design/design-system.md`](../design/design-system.md)) מוגדרים ב־`tailwind.config.ts`:

- **צבעי ליבה** — `primary: #000613`, `primary-container: #001f3f`, `secondary: #735c00`, `error: #ba1a1a`.
- **שני טוקני זהב נפרדים** (הכרעת [`../design/gaps.md`](../design/gaps.md) §ב): `brand-gold: #D4AF37` ללוגו ולמבטאים · `state-active: #fed65b` להדגשת מצב פעיל בתפריט.
- **היררכיית משטחים** — `surface-container-lowest` עד `surface-dim`, לפי הטבלה ב־design-system §1.
- **צבעי סטטוס סמנטיים כטוקנים** — `status-{success,warning,error,debt,neutral}-{bg,fg}`. ב־Stitch הם היו ערכים ישירים; כאן הם הופכים לטוקנים, כי כל badge במערכת ישתמש בהם.
- **רדיוסים** — `DEFAULT: 4px`, `lg: 8px`, `xl: 12px`, `full`. (הקוד של Stitch קובע, לא הפרוזה.)
- **מרווח** — יחידת בסיס 4px, `gutter: 16px`, `margin-desktop: 32px`, רוחב מקסימלי 1440px.

**הלוגו:** הלוגו שבשימוש הוא זה שסופק ע"י המשתמשת ומועתק **בייט־לבייט**, בלי חיתוך, שינוי צבע או שרטוט מחדש. שני קבצים, שניהם PNG 1536×1024 עם ערוץ אלפא אמיתי (הרקע השחור בתצוגה הוא שקיפות, לא צבע) — ולכן הם יושבים נקי גם על לבן וגם על נייבי:

- `public/brand/logo-mark.png` — הסימן לבדו, בלי טקסט. זה מה שנכנס לכותרות, לסיידבר ול־favicon. מוצג ביחס 3:2 המקורי, לא נחתך לריבוע.
- `public/brand/logo-wordmark.png` — הסימן יחד עם שם המוצר ו־tagline.

**שם המוצר הוא `Gilion`** — כך הוא מופיע ב־`prd.md`, ב־`erd.md`, ב־`package.json` ובכל קבצי התוכנית. ה־wordmark שסופק כתוב `GILYON`, כתיב שונה. ההכרעה: **הקוד והתיעוד נשארים `Gilion`**, ו־`logo-wordmark.png` נשמר בריפו כנכס שסופק אך **אינו משמש כשם המוצר על המסך**. מסך ההתחברות (שלב 01) יציג את `logo-mark.png` לצד המילה `Gilion` בטיפוגרפיה של המערכת, ולא את קובץ ה־wordmark.

**נכסים קודמים שנשארו בריפו ואינם בשימוש:** `mark.svg`, `favicon.svg`, `wordmark.svg`, `logo-full.png` — גזירות ברירת מחדל שקדמו ללוגו שסופק. הם נשמרים כ־fallback ואפשר למחוק אותם משהמיתוג יתייצב.

**החלפת לוגו בהמשך:** מחליפים מפאנל הניהול ([`11-admin-panel.md`](11-admin-panel.md)), בלי נגיעה בקוד. כל מקום שמציג לוגו קורא מ־`BusinessSettings` עם נפילה חזרה ל־`public/brand/` — אף רכיב לא מקשיח נתיב לקובץ.

## בדיקות

- **Vitest** — בדיקת שפיות אחת (`sanity.test.ts`) שמוודאת שהצנרת רצה.
- **Playwright** — `e2e/smoke.spec.ts`: העמוד נטען, `document.dir === 'rtl'`, ו־`getComputedStyle` על כותרת מחזיר `Frank Ruhl Libre` (ולא fallback).
- **בדיקת מיגרציה** — `prisma migrate deploy` מול Postgres של ה־Compose מצליח.

## סטיות מהתכנון שהתבררו במימוש

שלוש הכרעות שהשלב לא צפה, ותקפות מכאן והלאה:

1. **Tailwind v4 הוא CSS-first.** אין `tailwind.config.ts` — כל הטוקנים מוגדרים ב־`@theme` בתוך `app/globals.css`. כל טוקן שניתן לדריסה נכתב כ־`var(--gilion-*, <default>)`, כך ששלב 11 יוכל לדרוס אותו בזמן ריצה בלי rebuild.
2. **משתני הפונטים יושבים על `<html>` ולא על `<body>`.** `--font-serif` מוגדר ב־`:root`; משתנה CSS נפתר במקום ההצהרה, ולכן הפניה ל־`--font-frank-ruhl` שמוגדר רק על `<body>` הייתה מתרוקנת והפונטים היו נופלים ל־fallback של המערכת — בלי שום שגיאה.
3. **פורטים לא סטנדרטיים.** 3000, 5432, 9000, 9001 תפוסים ע"י פרויקט אחר על אותה מכונה. Gilion משתמש ב־3100 (אפליקציה), 5433 (Postgres), 9100/9101 (MinIO). מתועד ב־`README.md`.
4. **Prisma 7 הוציא את `url` מ־`schema.prisma`.** הוא יושב ב־`prisma.config.ts`, וה־driver adapter (`@prisma/adapter-pg`) מוזרק ל־`PrismaClient` ב־`lib/db.ts`.

## Definition of Done

- [x] `npm run dev` מרים את האפליקציה ו־`/` נטען ללא שגיאות קונסול.
- [x] `docker compose -f docker-compose.dev.yml up` מרים Postgres ו־MinIO, ו־`prisma migrate deploy` עובר מולם.
- [x] דף הטוקנים מציג עברית בשלושת הפונטים **עם גליפים עבריים אמיתיים**, לא fallback של הדפדפן.
- [x] `document.dir === 'rtl'` ובדיקת ה־smoke עוברת.
- [x] `npm run lint` נכשל בכוונה על `<div className="ml-4">` — הוכחה שכלל ה־RTL פעיל.
- [x] `npm run lint` נכשל בכוונה על ייבוא `@prisma/client` מתוך `components/` — הוכחה שכלל השכבות פעיל.
- [x] `npm run typecheck`, `npm run test`, `npm run e2e` — שלושתם ירוקים.
- [x] `public/brand/` מכיל את הלוגו שסופק (`logo-mark.png`, `logo-wordmark.png`) והוא קריא ב־40×40 על רקע בהיר וכהה כאחד.
- [x] מבנה התיקיות תואם ל־`conventions.md` §9.
