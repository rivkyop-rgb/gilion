# קונבנציות רוחביות

תשע החלטות שהאפיון משאיר פתוחות. הן נקבעות **פעם אחת כאן**, וכל 12 השלבים מפנים אליהן במקום לחזור עליהן. שינוי בהחלטה כאן הוא שינוי בכל השלבים.

---

## 1. RTL ועברית

כל הממשק עברי, כולל פורטל הלקוח.

- `<html dir="rtl" lang="he">` ברמת ה־root layout.
- **רק logical properties** של Tailwind: `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/`text-start`/`text-end`. שימוש ב־`ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-` נאסר ונאכף ב־ESLint (`tailwindcss/no-arbitrary-value` + כלל מותאם).
- **פונטים:** `Frank Ruhl Libre` (סריף — כותרות עמוד, מספרי KPI) + `Heebo` (סנס — ברירת מחדל, טבלאות, טפסים) + `JetBrains Mono` (מספרים, מזהים, מטא־דאטה לטינית). שלושתם מ־Google Fonts דרך `next/font`. ההחלטה מחליפה את `Libre Caslon Text` ו־`Hanken Grotesk` שיצאו מ־Stitch וחסרים גליפים עבריים — ראה [`../design/design-system.md`](../design/design-system.md) §2.
- **תאריכים:** `Intl.DateTimeFormat('he-IL')`, פורמט `dd/MM/yyyy`. אחסון תמיד UTC, תצוגה תמיד `Asia/Jerusalem`.
- **מספרים, מטבע ומזהים** (`₪45,000`, `24/10/2023`, `INV-2023-081`) נשארים LTR בתוך זרימת RTL. עוטפים ברכיב `<Ltr>` שמוסיף `dir="ltr"` + `unicode-bidi: isolate`.
- **shadcn/ui דורש התאמות RTL נקודתיות.** אלה הרכיבים שצריך לתקן ידנית והתיקון מתועד ב־`components/ui/`: `Select` ו־`DropdownMenu` (כיוון פתיחה ואייקון `chevron`), `Sheet` (צד ההחלקה), `Calendar` (סדר ימי השבוע וחצי ניווט), `Table` (יישור עמודות), `Toast` (מיקום). כל תיקון מסומן בהערה `// RTL:` בקוד.
- **אייקוני חצים ו־chevron מתהפכים.** `ArrowRight` בקוד = חץ שמצביע שמאלה על המסך.

## 2. אכיפת Multi-tenancy (FR-1)

**הסיכון הגדול ביותר במערכת.** דליפה בין עסקים היא כשל קריטי, ולכן האכיפה לא נשענת על זכירה של המפתח.

- `getTenantContext()` מחזיר `{ userId, businessId, role, customerId? }` מהסשן. זורק אם אין עסק פעיל.
- **Prisma Client Extension** מזריק `businessId` אוטומטית ל־`where` בכל `find*`/`update*`/`delete*` ול־`data` בכל `create` — עבור כל מודל שמסומן tenant-scoped.
- **מודלים tenant-scoped ישירות** (יש להם `business_id`): `Customer`, `Newspaper`, `AdOrder`, `Publication`, `Advertisement`, `Issue`, `Payment`, `AuditLog`, `UserMembership`.
- **מודלים tenant-scoped בעקיפין** (דרך ההורה): `PageType`, `AllowedAdShape`, `PriceRule`, `LayoutTemplate`, `TemplatePage`, `TemplateSlot`, `AdOrderItem`, `IssuePage`, `Placement`, `Reminder`, `PdfGenerationLog`. עבורם ה־extension מוסיף `where` מקונן דרך ה־relation אל ההורה שיש לו `business_id`. **אסור** לשלוף אותם לפי `id` בלבד.
- **`AdShape` הוא global** — צורות פרסום משותפות לכל העסקים (אין לו `business_id` ב־ERD). זה היוצא מן הכלל היחיד, ומתועד ככזה.
- **גישה ישירה ל־`prisma` נאסרת מחוץ ל־`lib/data/`** ונאכפת ב־ESLint (`no-restricted-imports`). כל השאר משתמש ב־`db` המורחב.
- **Postgres RLS מחוץ ל־MVP**, אבל כל טבלה נשמרת עם `business_id` לא־null (או נתיב ברור אל אחת כזו) כדי שאפשר יהיה להוסיף policies בלי שינוי סכימה.

## 3. מכונות מצבים

שלושת ה־enums של סטטוס לא מתעדכנים ידנית מפוזר בקוד. לכל אחד מודול דומיין טהור, ללא Prisma, נבדק ב־Vitest.

### `lib/domain/publication-status.ts` (FR-4, FR-5)

8 מצבים: `planned` · `missing_ad` · `ad_received` · `ready_for_layout` · `placed` · `published` · `canceled` · `billed`.

| אירוע                     | מעבר                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `PUBLICATION_CREATED`     | — → `planned`                                                                                  |
| `AD_LINKED`               | `planned` \| `missing_ad` → `ad_received` → (אם המודעה תקינה ומשויכת ללקוח) `ready_for_layout` |
| `AD_UNLINKED`             | `ad_received` \| `ready_for_layout` → `missing_ad`                                             |
| `REMINDER_WINDOW_ENTERED` | `planned` (בלי מודעה) → `missing_ad`                                                           |
| `PLACED`                  | `ready_for_layout` → `placed`                                                                  |
| `PLACEMENT_REMOVED`       | `placed` → `ready_for_layout`                                                                  |
| `ISSUE_CLOSED`            | `placed` → `published`                                                                         |
| `CANCELED`                | כל מצב פרט ל־`published` → `canceled`                                                          |
| `BILLED`                  | `published` → `billed`                                                                         |

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

```sql
-- סלוט תפוס פעם אחת בלבד
CREATE UNIQUE INDEX placement_slot_unique
  ON "Placement" ("issue_page_id", "template_slot_id")
  WHERE status = 'placed';

-- פרסום משובץ פעם אחת בגיליון, אלא אם אושרה חריגה
CREATE UNIQUE INDEX placement_publication_unique
  ON "Placement" ("publication_id", "issue_id")
  WHERE status = 'placed' AND duplicate_override_approved = false;
```

`issue_id` נשמר ב־`Placement` כעמודה מיותרת־במכוון (denormalized מ־`IssuePage`) כדי שהאינדקס השני יהיה אפשרי בכלל. עקביותה נאכפת ב־FK מורכב `(issue_id, issue_page_id)`.

הפרת אינדקס נתפסת בקוד (`P2002`) ומתורגמת להודעת שגיאה בעברית, לא ל־500.

## 5. קבצים פרטיים (FR-15)

- **MinIO bucket פרטי אחד.** שום URL של קובץ לא נחשף ללקוח — לא ב־HTML, לא ב־API response, לא ב־PDF.
- הגישה דרך Route Handler בשרת: `GET /api/files/[...key]` → בודק tenant + role + בעלות → מחזיר redirect ל־presigned URL בתוקף **5 דקות**.
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
2. **תבנית** — שינוי `LayoutTemplate`/`TemplateSlot` לא משנה גיליון קיים. בעת פתיחת גיליון, מבנה העמודים והסלוטים **מועתק** מהתבנית ל־`IssuePage`, ומיקומי השיבוץ נשמרים ב־`Placement.position/width/height` ולא נקראים מהתבנית בזמן ההפקה.
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
