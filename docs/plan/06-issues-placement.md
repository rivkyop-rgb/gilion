# שלב 06 — גיליונות ולוח שיבוץ

## מטרה

בסוף השלב גרפיקאית פותחת גיליון מתבנית, רואה מיד את כל הפרסומים שלא שובצו, וגוררת מודעות לסלוטים — כשהמערכת מונעת ממנה לשבץ בצורה לא מותרת, על סלוט תפוס, או פעמיים את אותו פרסום.

## תלויות

03 (תבניות), 04 (פרסומים), 05 (מודעות).

## מקורות באפיון

US-007 · FR-6 · FR-14 · FR-16 · FR-5 · ישויות: `Issue`, `IssuePage`, `Placement`

## Scope

**נכנס:** רשימת גיליונות · פתיחת גיליון מתבנית · לוח השיבוץ בשלושה פאנלים · שיבוץ, הסרה והעברה · אכיפת צורה מותרת · מניעת חפיפה במסד · אישור חריגת כפילות · נעילת גיליון סגור · מצבי drag & drop.

**לא נכנס:** עימוד חופשי — FR-14 קובע סלוטים/גריד בלבד · פרוס כפול (`עמוד 2-3`) — `IssuePage` הוא עמוד בודד ממוספר ([`../design/gaps.md`](../design/gaps.md) §א) · סלוט "תוכן מערכתי" — `TemplateSlot` הוא סלוט פרסומי בלבד · "מיקום מבוקש" ע"י הלקוח — לא קיים באפיון · שיבוץ אוטומטי (out of scope ב־PRD) · בדיקת גיליון והפקת PDF (07).

## מודל נתונים

`Issue` — `id`, `business_id`, `newspaper_id`, `issue_date`, `status: [draft, in_layout, ready_for_print, closed]`, `final_pdf_url?`, `closed_at?`, timestamps.

`IssuePage` — `id`, `issue_id`, `page_type_id`, `page_number: Int`, timestamps.

`Placement` — `id`, `publication_id`, `issue_page_id`, `advertisement_id`, `ad_shape_id`, `template_slot_id?`, `position`, `width: Decimal`, `height: Decimal`, `status: [placed, removed, published]`, `duplicate_override_approved: Boolean`, `duplicate_override_approved_by_user_id?`, `duplicate_override_approved_at?`, timestamps.

**פלוס `issue_id`** — עמודה denormalized מ־`IssuePage`, לא ב־ERD. בלעדיה אי אפשר לבנות את האינדקס שמונע שיבוץ כפול של פרסום בגיליון (`conventions.md` §4). עקביותה נאכפת ב־FK מורכב על `(issue_id, issue_page_id)`.

```prisma
@@unique([business_id, newspaper_id, issue_date])   // Issue — גיליון אחד לעיתון ביום
@@index([business_id, status, issue_date])           // Issue
@@unique([issue_id, page_number])                    // IssuePage
@@index([issue_page_id, status])                     // Placement
@@index([publication_id])                            // Placement
```

**ושני האינדקסים החלקיים מ־`conventions.md` §4** — הם הליבה של FR-16:

```sql
CREATE UNIQUE INDEX placement_slot_unique
  ON "Placement" ("issue_page_id", "template_slot_id") WHERE status = 'placed';

CREATE UNIQUE INDEX placement_publication_unique
  ON "Placement" ("publication_id", "issue_id")
  WHERE status = 'placed' AND duplicate_override_approved = false;
```

**מיקום ומידות:** `position` הוא JSON `{ x, y }` באחוזים ו־`width`/`height` באחוזים — כמו ב־`TemplateSlot` (שלב 03). בעת שיבוץ הם **מועתקים** מהסלוט ולא נקראים ממנו בזמן ההפקה, כדי ששינוי תבנית לא ישנה גיליון קיים (`conventions.md` §7).

## מסלולים ופעולות

| מסלול                    | תיאור          |
| ------------------------ | -------------- |
| `GET /issues`            | רשימת גיליונות |
| `GET /issues/new`        | פתיחת גיליון   |
| `GET /issues/[id]/board` | לוח השיבוץ     |

**Server Actions:** `createIssue(newspaperId, date, templateId)` · `addIssuePage(issueId, pageTypeId, pageNumber)` · `removeIssuePage` · `reorderIssuePages` · `placeAd(input)` · `removePlacement(placementId)` · `movePlacement(placementId, targetSlotId)` · `approveDuplicateOverride(publicationId, issueId)` · `setIssueStatus(issueId, status)`.

**`createIssue`** — טרנזקציה אחת: יוצר `Issue` ב־`draft`, **מעתיק** את מבנה העמודים מ־`LayoutTemplate` ל־`IssuePage`, ומחשב את רשימת הפרסומים המתוכננים לפי `(newspaper_id, publication_date = issue_date)`.

**`placeAd`** — הפעולה הכי רגישה במערכת. סדר הבדיקות:

1. הגיליון ניתן לעריכה (`draft` / `in_layout`, או `ready_for_print` עם `admin`).
2. הפרסום שייך לעסק, לעיתון ולתאריך הנכונים.
3. למודעה יש `customer_id` והוא **זהה** ללקוח הפרסום.
4. המודעה `validation_status = 'passed'`.
5. `ad_shape_id` של הסלוט = של הפרסום, והצורה ב־`AllowedAdShape` של סוג העמוד.
6. כתיבה — **האינדקסים החלקיים תופסים כאן** את סלוט תפוס ואת שיבוץ כפול.
7. `PLACED` במכונת המצבים → `placed`, `placement_status = 'placed'`.

## מסכים

1. **רשימת גיליונות** — מסך חדש. כרטיסים לפי עיתון, כל כרטיס: שם עיתון, תאריך גיליון ב־`dir="ltr"`, badge סטטוס (`draft` ניטרלי · `in_layout` warning "בעבודה" · `ready_for_print` success · `closed` ניטרלי), מד התקדמות "שובצו X מתוך Y", וכפתור "פתח לוח שיבוץ". גיליון `closed` מציג "הורד PDF סופי" (מופעל בשלב 07). primary "פתיחת גיליון חדש".

2. **פתיחת גיליון** — מודאל: בורר עיתון · בורר תאריך · בורר תבנית (מסונן לעיתון). מתחתיו **תצוגה מקדימה חיה**: כמה עמודים ייווצרו, וכמה פרסומים מתוכננים כבר קיימים לתאריך הזה. אם אין אף פרסום — אזהרה שאפשר לפתוח בכל זאת.

3. **לוח השיבוץ** — הפריסה מ־[`../design/screens/02-layout-board.md`](../design/screens/02-layout-board.md), שלושה פאנלים:
   - **ימין — פרסומים שלא שובצו.** רשימה עם ספירה בכותרת: לקוח, צורת פרסום, ותמונת המודעה אם קיימת. פרסום בלי מודעה מסומן `missing_ad` ו**אינו ניתן לגרירה**. מתחת — מודעות זמינות שאינן קשורות לפרסום ספציפי. זה מה ש־US-007 AC-2 דורש, ומה שקריטריון ההצלחה מ־PRD §7 נמדד עליו.
   - **מרכז — קנבס העמוד.** ביחס גובה־רוחב של `page_size`, רקע `surface-dim`, הסלוטים לפי ארבעת המצבים מ־`components.md`: ריק (מקווקו + שם הצורה) · מלא (תמונה + רצועת שם לקוח) · נבחר (גבול `primary` 2px + צל) · מיוחד (מקווקו זהב). **בלי סלוט "תוכן מערכתי" ובלי פרוס כפול.**
   - **שמאל — פרטי הנבחר.** לקוח, עיתון, עמוד, אזור, צורה וגודל (US-007 AC-4), וכפתור destructive "הסר שיבוץ".
   - **תחתית — נאב־סטריפ העמודים.** מיניאטורה סכמטית לכל עמוד, תווית `עמוד 1 (שער)`, גבול `primary` על הפעיל, וכרטיס `+` להוספה.

4. **מצבי Drag & Drop** — חסרים לגמרי בעיצוב הקיים ונקבעים כאן:
   - **נגרר** — הפריט חצי־שקוף, הסמן `grabbing`.
   - **יעד תקף** — הסלוט מקבל גבול `state-active` מלא ורקע זהב עדין.
   - **יעד חסום** — גבול `error` מקווקו, סמן `not-allowed`, ו־tooltip עם הסיבה ("צורת פרסום אינה מותרת בסוג עמוד זה" / "הסלוט תפוס" / "הפרסום כבר משובץ בגיליון").
   - **שחרור** — אנימציית snap קצרה.
   - **נעילה** — בגיליון `closed` הקנבס מקבל שכבת overlay עם אייקון מנעול והודעה "גיליון סגור — לא ניתן לערוך" (FR-6).

5. **מודאל אישור חריגת כפילות** — 500px, מסביר שהפרסום כבר משובץ בגיליון ומראה איפה, ודורש אישור מפורש. פתוח ל־`admin` בלבד, ורושם AuditLog.

## הרשאות

| פעולה                          | admin | sales | designer | accounting | customer |
| ------------------------------ | :---: | :---: | :------: | :--------: | :------: |
| צפייה בגיליונות ובלוח          |  ✅   |   👁   |    ✅    |     ❌     |    ❌    |
| פתיחת גיליון                   |  ✅   |  ❌   |    ✅    |     ❌     |    ❌    |
| שיבוץ, הסרה, העברה             |  ✅   |  ❌   |    ✅    |     ❌     |    ❌    |
| עריכת עמודים                   |  ✅   |  ❌   |    ✅    |     ❌     |    ❌    |
| **אישור חריגת כפילות**         |  ✅   |  ❌   |    ❌    |     ❌     |    ❌    |
| עריכת גיליון `ready_for_print` |  ✅   |  ❌   |    ❌    |     ❌     |    ❌    |

שתי החריגות שמורות ל־`admin` בלבד — FR-6 ו־FR-16 מגדירים אותן כ"משתמש עם הרשאה מתאימה".

## כללי ולידציה

**גיליון:**

1. גיליון אחד לעיתון בתאריך — `@@unique`.
2. `issue_date` לא בעבר ביצירה (אזהרה, לא חסימה).
3. מעברי סטטוס: `draft → in_layout → ready_for_print → closed`. חזרה אחורה רק ל־`admin` ורק עם AuditLog.
4. **`closed` חוסם כל כתיבה** ל־`Placement`, `IssuePage` ולסטטוס הפרסומים (FR-6).
5. `ready_for_print` — כתיבה רק ל־`admin`.

**שיבוץ** (`lib/domain/placement.ts`): 6. פרסום ומודעה חייבים להיות מאותו עסק כמו הגיליון. 7. `Publication.newspaper_id` = `Issue.newspaper_id`, ו־`publication_date` = `issue_date`. 8. למודעה `customer_id` שווה ללקוח הפרסום, ו־`validation_status = 'passed'` (US-005 AC-4). 9. `ad_shape_id` של הפרסום = של הסלוט. 10. הצורה ב־`AllowedAdShape` של `page_type_id` של העמוד (US-007 AC-3). 11. **סלוט תפוס** — נחסם באינדקס החלקי (FR-16). 12. **פרסום משובץ פעם אחת בגיליון** — נחסם באינדקס החלקי, נשבר רק עם `duplicate_override_approved = true` (FR-16). 13. **חפיפה גיאומטרית** — נבדקת ב־`slot-geometry.ts` המשותף משלב 03, גם לשיבוצים בלי `template_slot_id`. 14. העברה = הסרה + שיבוץ **בטרנזקציה אחת**, כפופה לאותן בדיקות. 15. הסרה מסמנת `status = 'removed'` ולא מוחקת — כדי לשמר היסטוריה ולא לשבור את האינדקסים. 16. שיבוץ → `PLACED`; הסרה → `PLACEMENT_REMOVED` (FR-5). 17. `position`/`width`/`height` מועתקים מהסלוט בזמן השיבוץ (`conventions.md` §7).

## בדיקות

**Vitest:**

- `placement-rules.test.ts` — 12 כללי הוולידציה, כל אחד בנפרד.
- `issue-status.test.ts` — 4 המצבים; `closed` חוסם כתיבה; חזרה אחורה רק ל־admin.
- `slot-geometry.test.ts` — מורחב משלב 03 לשיבוצים.

**Playwright:**

- `issue-open-unplaced.spec.ts` — **קריטריון הצלחה מ־PRD §7:** פתיחת גיליון ורשימת הלא־משובצים מוצגת מיד ומלאה (US-007 AC-1, AC-2).
- `placement-happy-path.spec.ts` — גרירה לסלוט, הצגת הפרטים, הסרה, גרירה מחדש (US-007 AC-3, AC-4).
- `placement-shape-mismatch.spec.ts` — צורה לא מותרת נחסמת ומציגה סיבה.
- `placement-slot-occupied.spec.ts` — **מירוץ שני לקוחות:** שתי לשוניות מנסות אותו סלוט בו־זמנית; אחת מצליחה, השנייה מקבלת שגיאה ברורה (FR-16).
- `placement-duplicate.spec.ts` — שיבוץ שני של אותו פרסום נחסם; `admin` מאשר חריגה ורשומת AuditLog נכתבת.
- `issue-closed-locked.spec.ts` — גיליון סגור: הקנבס נעול ו־Server Action ישירה נדחית בשרת (FR-6).
- `placement-ad-no-customer.spec.ts` — מודעה בלי לקוח לא ניתנת לשיבוץ.

## Definition of Done

- [ ] פתיחת גיליון יוצרת את העמודים מהתבנית ומציגה את הפרסומים המתוכננים לתאריך.
- [ ] רשימת הלא־משובצים מוצגת מיד עם פתיחת הלוח.
- [ ] גרירה לסלוט משבצת; הסלוט מציג לקוח, עמוד, אזור, גודל וצורה.
- [ ] שיבוץ בצורה לא מותרת נחסם **בשרת** עם סיבה בעברית.
- [ ] סלוט תפוס נחסם **במסד** — מאומת בבדיקת מירוץ, לא רק ב־UI.
- [ ] שיבוץ כפול של אותו פרסום נחסם, ו־`admin` בלבד מאשר חריגה עם AuditLog.
- [ ] מודעה בלי לקוח או עם ולידציה שנכשלה לא ניתנת לשיבוץ.
- [ ] גיליון סגור חסום לעריכה — גם בגישה ישירה ל־Server Action.
- [ ] ארבעת מצבי ה־drag & drop ממומשים, כולל tooltip עם הסיבה על יעד חסום.
- [ ] `position`/`width`/`height` מועתקים מהסלוט; שינוי תבנית לא משנה גיליון קיים.
- [ ] אין בלוח סלוט "תוכן מערכתי", אין פרוס כפול, ואין "מיקום מבוקש".
