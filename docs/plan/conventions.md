# קונבנציות רוחביות

תשע החלטות שהאפיון משאיר פתוחות. הן נקבעות **פעם אחת כאן**, וכל 12 השלבים מפנים אליהן במקום לחזור עליהן. שינוי בהחלטה כאן הוא שינוי בכל השלבים.

---

## 1. RTL ועברית

כל הממשק עברי, כולל פורטל הלקוח.

- `<html dir="rtl" lang="he">` ברמת ה־root layout.
- **רק logical properties** של Tailwind: `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/`text-start`/`text-end`. שימוש ב־`ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-` נאסר ונאכף ב־ESLint (`tailwindcss/no-arbitrary-value` + כלל מותאם).
- **פונטים:** `Frank Ruhl Libre` (סריף — כותרות עמוד, מספרי KPI) + `Google Sans` (סנס — ברירת מחדל, טבלאות, טפסים) + `JetBrains Mono` (מספרים, מזהים, מטא־דאטה לטינית). Frank Ruhl ו־JetBrains מ־Google Fonts דרך `next/font`; **Google Sans מתארח מקומית** (`app/fonts/`) כי אינו מוגש מ־Google Fonts CSS API. רישיון OFL, נשמר לצדו. `Google Sans` החליף את `Heebo` ב־23/08/2026 לבקשת המשתמשת — כיסוי עברי מלא נבדק (22 אותיות + ₪). ההחלטה מחליפה את `Libre Caslon Text` ו־`Hanken Grotesk` שיצאו מ־Stitch וחסרים גליפים עבריים — ראה [`../design/design-system.md`](../design/design-system.md) §2.
- **תאריכים:** `Intl.DateTimeFormat('he-IL')`, פורמט `dd/MM/yyyy`. אחסון תמיד UTC, תצוגה תמיד `Asia/Jerusalem`.
- **מספרים, מטבע ומזהים** (`₪45,000`, `24/10/2023`, `INV-2023-081`) נשארים LTR בתוך זרימת RTL. עוטפים ברכיב `<Ltr>` שמוסיף `dir="ltr"` + `unicode-bidi: isolate`.
- **shadcn/ui דורש התאמות RTL נקודתיות.** אלה הרכיבים שצריך לתקן ידנית והתיקון מתועד ב־`components/ui/`: `Select` ו־`DropdownMenu` (כיוון פתיחה ואייקון `chevron`), `Sheet` (צד ההחלקה), `Calendar` (סדר ימי השבוע וחצי ניווט), `Table` (יישור עמודות), `Toast` (מיקום). כל תיקון מסומן בהערה `// RTL:` בקוד.
- **אייקוני חצים ו־chevron מתהפכים.** `ArrowRight` בקוד = חץ שמצביע שמאלה על המסך.
- **יחידה אחת בממשק: סנטימטר.** המסד עובד במ״מ, הדומיין בתאי גריד, והמסך — **רק בס״מ, בשני הכיוונים**. אף מסך לא מציג "תאים", ואף מסך לא מערבב יחידות: רוחב בעמודות לצד גובה בס״מ נוסה ונפסל, כי שתי יחידות בשני שדות סמוכים נקראות כבלבול ולא כדיוק. ההמרה מס״מ למ״מ קורית פעם אחת בכל Server Action, בקצה; `lib/domain/` ו־Prisma לא רואים ס״מ לעולם. `colsForWidthCm()`/`rowsForHeightCm()` מצמידים גודל מוקלד לתאים שלמים — **בשרת**, שלא סומך על מה שהלקוח חישב — ו־`footprintMm()` מחזיר את הגודל המודפס. כשההצמדה משנה את מה שהוקלד, המסך **חייב להגיד זאת לפני השמירה**, אחרת המספר ששונה נראה כמו באג. **מרווח שאינו אפס מקצר כל גודל מודפס בדיוק בגודלו** — ולכן ברירת המחדל היא **מודול של 1 ס״מ בשני הכיוונים בלי מרווח** (26 × 41 ב־Tabloid עם שוליים 0.95 ס״מ). זה מה שהופך כל מספר שלם של ס״מ לגודל אמיתי; מודול גס יותר מצמיד את מה שהוקלד למספר שאיש לא ביקש.
- **גריד העמוד נספר מימין.** עמודה `0` היא תחילת הזרימה ב־RTL, כלומר **הקצה הימני של העמוד**; שורה `0` היא הקצה העליון. ההמרה מתאים למילימטרים קיימת פעם אחת בלבד ב־`toMillimetres()`, וההמרה ממצביע העכבר לתא פעם אחת בלבד ב־`cellAtPointer()` — שתיהן ב־`lib/domain/slot-geometry.ts`, שתיהן טהורות ונבדקות ב־Vitest. **אסור** לחשב `left`/`x` ידנית ברכיב. רשת תאים מרונדרת בסדר קריאה בתוך `grid-template-columns` תחת `dir="rtl"` — בלי אריתמטיקה של היפוך. ראה את הסטייה המתועדת ב־[`03-newspaper-config.md`](03-newspaper-config.md).

## 2. אכיפת Multi-tenancy (FR-1)

**הסיכון הגדול ביותר במערכת.** דליפה בין עסקים היא כשל קריטי, ולכן האכיפה לא נשענת על זכירה של המפתח.

- `getTenantContext()` מחזיר `{ userId, businessId, role, customerId? }` מהסשן. זורק אם אין עסק פעיל.
- **Prisma Client Extension** מזריק `businessId` אוטומטית ל־`where` בכל `find*`/`update*`/`delete*` ול־`data` בכל `create` — עבור כל מודל שמסומן tenant-scoped.
- **מודלים tenant-scoped ישירות** (יש להם `business_id`): `Customer`, `Newspaper`, `AdOrder`, `Publication`, `Advertisement`, `Issue`, `Payment`, `AuditLog`, `UserMembership`.
- **מודלים tenant-scoped בעקיפין** (דרך ההורה): `PageType`, `AdShape`, `AllowedAdShape`, `PriceRule`, `AdOrderItem`, `IssuePage`, `Placement`, `Reminder`, `PdfGenerationLog`. עבורם ה־extension מוסיף `where` מקונן דרך ה־relation אל ההורה שיש לו `business_id`. **אסור** לשלוף אותם לפי `id` בלבד.
- **אין מודלים global. `AdShape` שייך לעיתון** — היפוך מודע של החלטה קודמת, 24/08/2026: קטלוג הצורות נקבע על ידי כל עיתון בנפרד (US-006 AC-4), ולכן `AdShape.newspaper_id` ו־tenant-scoping בעקיפין דרך `Newspaper`. עיתון חדש נזרע בהעתק של קטלוג הבסיס (`lib/domain/base-shapes.ts`) ולא בהפניה למשהו משותף — כדי שעריכה בעיתון אחד לא תשנה אחר. `GLOBAL_MODELS` נשאר ריק ב־`lib/data/tenant-models.ts`, וכל תוספת אליו היא החלטה שדורשת עדכון של הסעיף הזה.
- **טבלאות קישור נסגרות ב־FK מורכב, לא בבדיקה בקוד.** ל־`Newspaper`, `PageType` ו־`AdShape` יש `@@unique([id, newspaper_id])`, ו־`AllowedAdShape`/`PriceRule` מפנים אליהם בזוג `(id, newspaper_id)`. כך שורה שמצליבה סוג עמוד של עיתון אחד עם צורה של עיתון אחר אינה ניתנת לייצוג במסד — לא "נדחית בוולידציה".
- **גישה ישירה ל־`prisma` נאסרת מחוץ ל־`lib/data/`** ונאכפת ב־ESLint (`no-restricted-imports`). כל השאר משתמש ב־`db` המורחב.
  **הורחב 23/09/2026:** הכלל חסם את החבילה `@prisma/client` בלבד, ולכן `basePrisma` — הלקוח **הלא־מוגבל**, שמיוצא מ־`lib/data/db` — היה ניתן לייבוא מכל מקום, ושלוש Server Actions כתבו דרכו ל־`AdOrder` עם `where: { id }` בלי `business_id`. הכלל מונה עכשיו גם את השם הזה. `lib/auth/` פטור במפורש: כל מה שקורה שם רץ **לפני** שיש עסק פעיל, וזו השאלה היחידה שה־extension לא יכול לעזור בה.
- **Postgres RLS מחוץ ל־MVP**, אבל כל טבלה נשמרת עם `business_id` לא־null (או נתיב ברור אל אחת כזו) כדי שאפשר יהיה להוסיף policies בלי שינוי סכימה.

## 3. מכונות מצבים

שלושת ה־enums של סטטוס לא מתעדכנים ידנית מפוזר בקוד. לכל אחד מודול דומיין טהור, ללא Prisma, נבדק ב־Vitest.

### `lib/domain/publication-status.ts` (FR-4, FR-5)

7 מצבים: `planned` · `missing_ad` · `ad_received` · `ready_for_layout` · `placed` · `published` · `canceled`.

**`billed` הוסר ב־23/09/2026.** הוא היה כאן וב־FR-4 מהיום הראשון, ושום קוד לא הפעיל את האירוע שמגיע אליו: שלב 08 הפך את "שולם" ל**נגזר** מסכום התשלומים מול ההזמנה ואסר על כל מסך לקבוע אותו ביד (כלל 7 שם), וסטטוס שני שאומר אותו דבר ידנית הוא בדיוק מה שהכלל ההוא מונע. ראה `prd.md` §10 היפוך 6.

| אירוע                     | מעבר                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `PUBLICATION_CREATED`     | — → `planned`                                                                                  |
| `AD_LINKED`               | `planned` \| `missing_ad` → `ad_received` → (אם המודעה תקינה ומשויכת ללקוח) `ready_for_layout` |
| `AD_UNLINKED`             | `ad_received` \| `ready_for_layout` → `missing_ad`                                             |
| `REMINDER_WINDOW_ENTERED` | `planned` (בלי מודעה) → `missing_ad`                                                           |
| `PLACED`                  | `ready_for_layout` → `placed`                                                                  |
| `PLACEMENT_REMOVED`       | `placed` → `ready_for_layout`                                                                  |
| `ISSUE_CLOSED`            | `placed` → `published`                                                                         |
| `ISSUE_REOPENED`          | `published` → `placed` (מנהל שפותח גיליון סגור, שלב 07)                                        |
| `CANCELED`                | כל מצב פרט ל־`published` → `canceled`                                                          |

`placement_status` הוא שדה נגזר: `placed` כאשר קיים `Placement` פעיל, אחרת `not_placed`. הוא מתעדכן באותה טרנזקציה של השיבוץ ולעולם לא בנפרד.

### `lib/domain/order-status.ts` (FR-3)

6 מצבים: `draft` → `pending_approval` → `approved` \| `rejected`; `approved` → `completed`; כל מצב פרט ל־`completed` → `canceled`. `approved` הוא **חד־כיווני** — הזמנה מאושרת לא חוזרת לטיוטה, כי כבר נוצרו ממנה פרסומים מחייבים.

### `lib/domain/issue-status.ts` (FR-6)

4 מצבים: `draft` → `in_layout` → `ready_for_print` → `closed`.

- `draft`, `in_layout` — עריכה חופשית.
- `ready_for_print` — עריכה רק ל־`admin`.
- `closed` — **חסום לעריכה רגילה**, כולל שיבוץ, הסרה והעברה. חוזר אחורה רק ל־`admin` ורק עם רישום ב־AuditLog.

**כלל אכיפה:** כל מעבר עובר דרך `transition(current, event)` שזורק `InvalidTransitionError` על מעבר לא־חוקי. אין `prisma.publication.update({ data: { status } })` בשום מקום מחוץ למודולים האלה.

## 4. מניעת חפיפות בשיבוץ (FR-16, US-007)

נאכף **במסד**, לא רק ב־UI — כי UI לא מגן מפני שתי לשוניות פתוחות.

אין יותר "סלוט" שאפשר לסמן כתפוס: מאז היפוך 24/08/2026 לשיבוץ יש גיאומטריה משלו על גריד העמוד (`col`, `row`, `cols`, `rows`), ולכן "תפוס" הוא **חפיפת מלבנים**, לא ערך כפול. Postgres יודע לאכוף בדיוק את זה:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- נדרש כדי לצרף `=` על מזהה לתוך אינדקס GiST

-- שתי מודעות לא חופפות באותו עמוד
ALTER TABLE "Placement" ADD CONSTRAINT placement_no_overlap
  EXCLUDE USING gist (
    "issue_page_id"                    WITH =,
    int4range("col", "col" + "cols")   WITH &&,
    int4range("row", "row" + "rows")   WITH &&
  ) WHERE (status = 'placed');

-- פרסום משובץ פעם אחת בגיליון, אלא אם אושרה חריגה
CREATE UNIQUE INDEX placement_publication_unique
  ON "Placement" ("publication_id", "issue_id")
  WHERE status = 'placed' AND duplicate_override_approved = false;
```

טווחים חצי־פתוחים (`[col, col+cols)`) הם מה שגורם לשתי מודעות שנוגעות בקצה **לא** להיחשב חופפות — אותו כלל בדיוק שמימש `overlaps()` ב־`lib/domain/slot-geometry.ts`, כדי שהדומיין והמסד לא יחלקו על מקרה קצה.

`issue_id` נשמר ב־`Placement` כעמודה מיותרת־במכוון (denormalized מ־`IssuePage`) כדי שהאינדקס השני יהיה אפשרי בכלל. עקביותה נאכפת ב־FK מורכב `(issue_id, issue_page_id)`.

**שני קודי שגיאה שונים.** הפרת ה־unique היא `P2002` של Prisma; הפרת ה־EXCLUDE היא `23P01` של Postgres, ו־Prisma **לא** ממפה אותה ל־`P2002` — צריך לבדוק את קוד השגיאה של הדרייבר. שתיהן מתורגמות להודעה בעברית, לא ל־500.

`btree_gist` נבדק כזמין בסביבת הפיתוח (Postgres 18.6, גרסת ברירת מחדל 1.8); ההתקנה עצמה נכנסת למיגרציה של שלב 06 ודורשת הרשאת superuser על ה־DB.

## 5. קבצים פרטיים (FR-15)

- **MinIO bucket פרטי אחד.** שום URL של קובץ לא נחשף ללקוח — לא ב־HTML, לא ב־API response, לא ב־PDF.
- הגישה דרך Route Handler בשרת: `GET /api/files/[...key]` → בודק tenant + role + בעלות → **זורם את הבתים בעצמו**.
  **תוקן 23/09/2026.** הסעיף הזה אמר "מחזיר redirect ל־presigned URL בתוקף 5 דקות", וזה מה שנבנה — והתוצאה הייתה **הבאג החמור ביותר בפרויקט**: `presignedGetObject` חתם על `localhost:9100`, שם שקיים במכונה של השרת ולא במכונה של המשתמשת, ולכן כל תצוגה מקדימה במוצר הייתה ריבוע ריק לכל מי שלא יושב על השרת — בלי שורה אחת בלוג, כי `<img>` שנכשל לא מדווח וההפניה נשלחה בהצלחה. הזרמה שומרת בדיוק על מה שהסעיף הזה קיים בשבילו (הבתים עוברים רק אחרי בדיקת ההרשאה) ומוותרת על החיסרון היחיד שלה — עומס על האפליקציה — שלא נמדד כבעיה. ראה CLAUDE.md §מלכודות.
- **מבנה מפתחות:** `{businessId}/ads/{adId}/{original|current|previous}.{ext}` · `{businessId}/ads/{adId}/preview.png` · `{businessId}/issues/{issueId}/final.pdf`.
- ה־`businessId` בתחילת המפתח הוא שכבת הגנה שנייה: ה־route משווה אותו ל־`businessId` שבסשן לפני שהוא חותם משהו.
- PDF טיוטה **לא נכתב ל־MinIO** — הוא נשלח ישירות ל־stream בתגובה (FR-22).

## 6. לוג ביקורת (FR-10)

`withAudit()` עוטף פעולה ורושם `AuditLog` **באותה טרנזקציה**. אם הפעולה נכשלת — אין רשומת לוג. אם הלוג נכשל — הפעולה מתבטלת.

שבע הפעולות מ־ERD: `approve_order` · `reject_order` · `cancel_publication` · `close_issue` · `generate_pdf` · `update_payment` · `override_duplicate_placement`.

```ts
await withAudit(
  { action: 'approve_order', targetType: 'AdOrder', targetId: order.id },
  async (tx) => { /* ... */ return { old, new } }
);
```

`old_value`/`new_value` הם JSON של השדות שהשתנו בלבד, לא של הרשומה כולה. **אין** endpoint לעריכה או מחיקה של `AuditLog` — הרשאת כתיבה בלבד ברמת שכבת הנתונים.

## 7. חוסר־שינוי לאחור (FR-17, US-006)

שלושה כללים שנאכפים בקוד ומתועדים בכל שלב רלוונטי:

1. **מחיר** — `Publication.price` נכתב פעם אחת בעת אישור ההזמנה, מועתק מ־`AdOrderItem.price`. שינוי מאוחר ב־`PriceRule` **לא נוגע בו**. `PriceRule` משמש רק כברירת מחדל בזמן יצירת ההזמנה.
2. **גריד** — שינוי הגדרות העמוד של העיתון (`columns`, `row_height_mm`, `gutter_mm`, `margin`, `page_size`) או של קטלוג הצורות **לא משנה גיליון קיים**. בעת פתיחת גיליון, הגריד **מצולם** אל ה־`Issue`, וכל שיבוץ שומר גיאומטריה משלו ב־`Placement.col/row/cols/rows`. ההפקה קוראת את הצילום ואת השיבוץ בלבד — לעולם לא את `Newspaper` או `AdShape` החיים. (עד 24/08/2026 הכלל הזה דיבר על העתקת `LayoutTemplate`; שכבת התבניות בוטלה, הכלל נשאר.)
3. **גיליון סגור** — `Issue.status = 'closed'` חוסם כל כתיבה ל־`Placement`, `IssuePage` ולסטטוס הפרסומים שבו.

## 8. הפקת PDF (FR-22)

- Route ייעודי `/print/issue/[id]` שמרנדר את הגיליון כ־HTML עם `@page` תואם ל־`Newspaper.page_size`, `Newspaper.margin` ו־`Newspaper.print_quality`.
- Playwright/Chromium (`page.pdf()`) ממיר. אותו Chromium שמשמש ל־E2E.
- **ב־MVP סינכרוני.** BullMQ + Redis נכנסים רק אם נמדד זמן הפקה שחורג מ־30 שניות בגיליון טיפוסי.
- **טיוטה:** stream בלבד, מסומן `DRAFT` בסימן מים, לא נשמר. נרשם ב־`PdfGenerationLog` עם `file_url = null`.
- **סופי:** נשמר ל־MinIO ו**מחליף** את הקודם (`Issue.final_pdf_url`). לוג ההפקה מצטבר, הקובץ לא.

## 9. מבנה תיקיות ושכבות

```
app/
  (internal)/          # מעטפת פנימית — סיידבר + סרגל עליון
  (portal)/            # מעטפת פורטל לקוח — נפרדת לחלוטין (FR-9)
  (auth)/              # התחברות ובחירת עסק
  api/files/[...key]/  # Route Handler יחיד לקבצים
  print/issue/[id]/    # רינדור להדפסה
lib/
  domain/              # לוגיקה עסקית טהורה. ללא Prisma, ללא React. Vitest ללא DB.
  data/                # Prisma בלבד. השכבה היחידה שמייבאת @prisma/client.
  auth/                # סשן, RBAC, getTenantContext
  storage/             # MinIO
components/
  ui/                  # shadcn + התאמות RTL
  <domain>/            # רכיבים לפי תחום
```

- **Server Actions** הן ברירת המחדל לכתיבה. **Route Handlers** רק לקבצים ול־webhooks.
- כל Server Action מתחילה ב־`getTenantContext()` + בדיקת הרשאה, וכל קלט עובר `zod` **בשרת** — ולידציית לקוח היא UX בלבד ולעולם לא שכבת אבטחה.
- `lib/domain/` לא מייבא כלום מ־`lib/data/`. הכיוון תמיד data → domain.
- **גיאומטריית העמוד יושבת כולה ב־`lib/domain/`:** `grid.ts` (גזירת הגריד מגודל העמוד ומהשוליים), `base-shapes.ts` (קטלוג הבסיס שכל עיתון חדש מקבל העתק שלו), `slot-geometry.ts` (המרות RTL, חפיפה, אזורים מותרים). רכיבים, actions ושכבת הנתונים **צורכים** אותן ואינם מחשבים גיאומטריה בעצמם — זה מה שמאפשר לבדוק את כל הכללים ב־Vitest בלי דפדפן ובלי DB.
