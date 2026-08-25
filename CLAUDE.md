@AGENTS.md

# Gilion

מערכת לניהול פרסום בעיתון. הממשק כולו עברי RTL.

## לפני כתיבת קוד

1. `docs/plan/conventions.md` — תשע החלטות רוחביות שמחייבות את כל השלבים. לקרוא פעם אחת.
2. `docs/plan/README.md` — סדר השלבים והתלויות. עובדים על שלב אחד בכל פעם.
3. `docs/prd.md` + `docs/erd.md` — **מקור האמת היחיד** לדרישות ולמודל הנתונים.
4. `docs/design/gaps.md` — לפני מימוש כל מסך. קבצי Stitch הם רפרנס ויזואלי בלבד; התוכן בהם מומצא.

## כללים שנאכפים ב־ESLint

- **RTL:** רק logical properties — `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/`text-start`/`text-end`. `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-` חסומים.
- **שכבות:** `@prisma/client` מיובא רק ב־`lib/data/` וב־`lib/db.ts`. כל השאר עובר דרך `db`.

## כללים שלא נאכפים אוטומטית

- **Tailwind v4 הוא CSS-first.** אין `tailwind.config.ts` — הטוקנים ב־`@theme` בתוך `app/globals.css`.
- **טוקן שניתן לדריסה נכתב `var(--gilion-*, <default>)`** כדי שפאנל הניהול (שלב 11) יוכל לשנות אותו בזמן ריצה.
- **אין ערך צבע או נתיב לוגו מקושח ברכיבים.** לוגו מגיע דרך `<BrandMark />`, צבע דרך טוקן.
- **מספרים, מטבע ומזהים לטיניים** בזרימת RTL עוטפים ב־`ltr-isolate`.
- **Server Actions** הן ברירת המחדל לכתיבה; Route Handlers רק לקבצים. כל action מתחילה ב־`getTenantContext()` + בדיקת הרשאה + `zod` בשרת.

## פורטים

3000/5432/9000/9001 תפוסים ע"י פרויקט אחר. Gilion: אפליקציה `3100`, Postgres `5433`, MinIO `9100`/`9101`.
Docker: המשתמש כבר בקבוצת `docker`, אבל סשן ישן לא רואה זאת — יציאה וכניסה מחדש, או `sudo` בינתיים.

## משתני סביבה שאינם ב־git

`.env` ו־`.env.example` שניהם ב־`.gitignore` (`.env*`), ולכן מה שנדרש להרצה מתועד כאן:

- **`AUTH_TRUST_HOST=true` — חובה בכל הרצה שאינה `next dev`**, כולל `next start` על localhost. בלעדיו Auth.js 5 מסרב לסמוך על ה־Host, לא כותב את עוגיית הסשן, וההתחברות **חוזרת לטופס בלי שום הודעת שגיאה**. בלוג זה מופיע כ־`UntrustedHost`.
- `DATABASE_URL`, `AUTH_SECRET` ומשתני MinIO — לפי `docker-compose.dev.yml`.

## הרצה להדגמה

`next dev` מקמפל כל מסך ופעולה בפנייה הראשונה אליהם. במכונה עמוסה זה נראה כאילו הכפתורים לא מגיבים. **להדגמה מול המשתמשת תמיד `npm run build` + `next start`** — הפרש של פי אלף בזמן התגובה.
