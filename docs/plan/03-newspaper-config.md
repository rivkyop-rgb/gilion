# שלב 03 — הגדרות עיתון, מחירון ותבניות שיבוץ

## מטרה

בסוף השלב Admin מגדיר עיתון עם סוגי עמודים, קובע אילו צורות פרסום מותרות בכל סוג עמוד, מתמחר אותן, ובונה תבנית שיבוץ עם סלוטים — כך שכל השלבים הבאים יודעים מה מותר לשבץ, איפה, ובכמה.

## תלויות

1.

## מקורות באפיון

US-006 · FR-14 · FR-17 · FR-21 · ישויות: `Newspaper`, `PageType`, `AdShape`, `AllowedAdShape`, `PriceRule`, `LayoutTemplate`, `TemplatePage`, `TemplateSlot`

## Scope

**נכנס:** CRUD עיתון כולל גודל עמוד, שוליים, איכות דפוס, לוגו, באנר קבוע וגודל קובץ מקסימלי · סוגי עמודים · קטלוג צורות פרסום · צורות מותרות לכל סוג עמוד · מטריצת מחירון · תבניות שיבוץ עם עמודים וסלוטים · עורך גריד ויזואלי.

**לא נכנס:** מחירים לפי לקוח או הנחות · תבניות משותפות בין עיתונים · תוקף מחירון לפי תאריכים · ולידציית dpi, CMYK או bleed — **המצאות של Stitch** ([`../design/gaps.md`](../design/gaps.md) §א) · עימוד חופשי (FR-14 מגדיר מפורשות סלוטים/גריד בלבד).

## מודל נתונים

`Newspaper` — `id`, `business_id`, `name`, `page_size`, `margin: Decimal`, `print_quality`, `logo_url?`, `fixed_banner_url?`, `max_ad_file_size: Int`, timestamps.

`PageType` — `id`, `newspaper_id`, `name`, timestamps. (שער, אחורי, פנימי, פרימיום, מרכזי — כטקסט חופשי, לא enum.)

`AdShape` — `id`, `name`, `size_group: [eighth, quarter, half, full, strip, other]`, timestamps. **גלובלי — היוצא מן הכלל היחיד ב־`conventions.md` §2.**

`AllowedAdShape` — `id`, `page_type_id`, `ad_shape_id`, timestamps.

`PriceRule` — `id`, `newspaper_id`, `page_type_id`, `ad_shape_id`, `price: Decimal`, timestamps.

`LayoutTemplate` — `id`, `newspaper_id`, `name`, timestamps.

`TemplatePage` — `id`, `layout_template_id`, `page_type_id`, `page_number: Int`, timestamps.

`TemplateSlot` — `id`, `template_page_id`, `ad_shape_id`, `position`, `width: Decimal`, `height: Decimal`, timestamps.

```prisma
@@unique([newspaper_id, name])                              // PageType
@@unique([page_type_id, ad_shape_id])                       // AllowedAdShape
@@unique([newspaper_id, page_type_id, ad_shape_id])         // PriceRule — מחיר אחד לצירוף
@@unique([layout_template_id, page_number])                 // TemplatePage
@@index([newspaper_id])                                     // LayoutTemplate, PriceRule
```

**החלטת מימוש — `position`, `width`, `height`:** ה־ERD משאיר את היחידות פתוחות, והעיצוב מציג `130x380 mm` שהוא מספר מומצא של Stitch. **ההכרעה:** `width`/`height` הם **אחוזים מרוחב/גובה העמוד** (0–100), ו־`position` הוא JSON `{ x, y }` באחוזים. הסיבה: תבנית נשארת תקפה גם אם `Newspaper.page_size` משתנה, וההמרה למ"מ קורית פעם אחת בהפקת ה־PDF לפי `page_size` בפועל.

**Cascade:** `Newspaper → PageType/PriceRule/LayoutTemplate` = cascade. `AdShape → AllowedAdShape` = restrict (צורה בשימוש לא נמחקת). `Newspaper → Issue` = restrict — **עיתון עם גיליונות לא נמחק.**

## מסלולים ופעולות

| מסלול                                           | תיאור                  |
| ----------------------------------------------- | ---------------------- |
| `GET /settings/newspapers`                      | רשימת עיתונים          |
| `GET /settings/newspapers/[id]`                 | הגדרות עיתון — לשוניות |
| `GET /settings/newspapers/[id]/pricing`         | מטריצת מחירון          |
| `GET /settings/newspapers/[id]/templates`       | רשימת תבניות           |
| `GET /settings/newspapers/[id]/templates/[tid]` | עורך תבנית             |
| `GET /settings/ad-shapes`                       | קטלוג צורות פרסום      |

**Server Actions:** `createNewspaper` · `updateNewspaper` · `createPageType` · `deletePageType` · `setAllowedShapes(pageTypeId, shapeIds[])` · `upsertPriceRule` · `bulkUpsertPriceRules` · `createTemplate` · `duplicateTemplate` · `upsertTemplatePage` · `upsertTemplateSlot` · `deleteTemplateSlot` · `reorderTemplatePages`.

## מסכים

**כולם חדשים. עורך התבנית הוא המסך המורכב ביותר במערכת אחרי לוח השיבוץ.**

1. **רשימת עיתונים** — כרטיסים ולא טבלה: לוגו העיתון, שם ב־`headline-md`, ומטא־דאטה ב־`label-sm` מונו (גודל עמוד · מספר סוגי עמודים · מספר תבניות). כרטיס מקווקו עם `+` בסוף.

2. **הגדרות עיתון** — כותרת עמוד + לשוניות: **כללי** (שם, גודל עמוד, שוליים, איכות דפוס, גודל קובץ מקסימלי, העלאת לוגו ובאנר) · **סוגי עמודים** · **מחירון** · **תבניות**. בלשונית "כללי", `max_ad_file_size` נקלט ב־MB עם המרה לבתים, ומתחתיו הערה שהוא מה שנאכף בהעלאת מודעה (FR-21). איכות הדפוס היא שדה טקסט חופשי — כך ב־ERD — **לא בורר dpi**.

3. **סוגי עמודים** — רשימה, וכל שורה נפתחת לבחירת הצורות המותרות. הצורות מוצגות כ**מלבנים בפרופורציה** — הדפוס המוצלח ממסך 06 של Stitch ([`../design/gaps.md`](../design/gaps.md) §ב), לא כ־checkboxes. מלבן נבחר מקבל רקע `state-active` וגבול `secondary`.

4. **מטריצת מחירון** — טבלה דו־ממדית: שורות = סוגי עמודים, עמודות = צורות פרסום. תא של צירוף שאינו מותר (`AllowedAdShape`) מוצג מושבת ומקווקו. עריכה inline בתא, לפי הדפוס מטבלת הגבייה. סכומים ב־`dir="ltr"`. תא ריק = אין מחיר בסיסי, וייקלט ידנית בהזמנה.

5. **עורך תבנית שיבוץ** — שלושה אזורים, בהשראת לוח השיבוץ:
   - **ימין:** רצועת עמודי התבנית, כמו נאב־סטריפ העמודים מ־`components.md`. לכל עמוד מספר וסוג. `+` להוספה, גרירה לשינוי סדר.
   - **מרכז:** קנבס העמוד ביחס גובה־רוחב של `page_size`, על רקע `surface-dim`. הסלוטים מלבנים מקווקווים; גרירה על אזור ריק יוצרת סלוט חדש; גרירת פינה משנה גודל. הצמדה לגריד של 5%. **חפיפה בין סלוטים נחסמת ויזואלית** — סלוט חופף מקבל גבול `error`, ולא ניתן לשמור.
   - **שמאל:** מאפייני הסלוט הנבחר — צורת פרסום (מוגבלת ל־`AllowedAdShape` של סוג העמוד הזה), מיקום וגודל באחוזים, וכפתור מחיקה destructive.

6. **קטלוג צורות פרסום** — טבלה פשוטה: שם, `size_group`, ותצוגה מוקטנת. גלובלי, ולכן מסומן במפורש "משותף לכל העסקים".

## הרשאות

| פעולה            | admin | sales | designer | accounting | customer |
| ---------------- | :---: | :---: | :------: | :--------: | :------: |
| כל הגדרות העיתון |  ✅   |  ❌   |    ❌    |     ❌     |    ❌    |
| צפייה במחירון    |  ✅   |   👁   |    ❌    |     👁      |    ❌    |
| צפייה בתבניות    |  ✅   |  ❌   |    👁     |     ❌     |    ❌    |

**רק Admin** מגדיר — FR-8. `sales` צריך לראות מחירון כדי לתמחר הזמנה, `designer` צריך לראות תבניות כדי להבין את הגיליון.

## כללי ולידציה

1. `name` ייחודי בתוך העסק.
2. `margin` ≥ 0 וקטן מחצי הממד הקטן של העמוד.
3. `max_ad_file_size` > 0. ברירת מחדל מוצעת 10MB. **הוא המקור היחיד למגבלה** — אין מספר קשיח בקוד (FR-21).
4. `page_size` מרשימה סגורה (A3, A4, Tabloid, Berliner, Broadsheet) + "מותאם אישית" עם רוחב×גובה במ"מ.
5. `PageType` — שם ייחודי בעיתון. מחיקה נחסמת אם קיים `TemplatePage` או `IssuePage` שמצביע עליו.
6. `AllowedAdShape` — הסרת צורה נחסמת אם קיים `TemplateSlot` שמשתמש בה בסוג העמוד הזה.
7. `PriceRule` — `price` ≥ 0; רק צירוף שקיים ב־`AllowedAdShape`.
8. `TemplateSlot` — `width`/`height` בין 1 ל־100; `x + width ≤ 100` ו־`y + height ≤ 100`; `ad_shape_id` חייב להיות ב־`AllowedAdShape` של `page_type_id` של העמוד.
9. **מניעת חפיפה בין סלוטים באותו עמוד תבנית** — נבדק ב־`lib/domain/slot-geometry.ts` (חיתוך מלבנים), בשרת. אותו מודול משמש את שלב 06.
10. `TemplatePage.page_number` רציף ומתחיל ב־1.
11. **חוסר־שינוי לאחור** (`conventions.md` §7): עריכת תבנית או מחיר **לא נוגעת** בגיליון קיים או בפרסום מאושר. ה־UI מציג הערה מפורשת בעורך התבנית כשהתבנית בשימוש בגיליון פתוח (US-006 AC-5).

## בדיקות

**Vitest:**

- `slot-geometry.test.ts` — חיתוך מלבנים: נגיעה בקצה מותרת, חפיפה של פיקסל נחסמת, סלוט שחורג מגבולות העמוד נחסם.
- `pricing.test.ts` — `getPriceFor(newspaper, pageType, shape)` מחזיר מחיר או `null`; צירוף לא מותר זורק.
- `newspaper-validation.test.ts` — 11 הכללים.

**Playwright:**

- `newspaper-setup.spec.ts` — יצירת עיתון מלא: הגדרות → 3 סוגי עמודים → צורות מותרות → מחירון (US-006 AC-1,2,3).
- `template-editor.spec.ts` — יצירת תבנית, ציור 4 סלוטים, ניסיון ליצור סלוט חופף → נחסם, שמירה, טעינה מחדש (US-006 AC-4, FR-14).
- `pricing-immutability.spec.ts` — **מאמת FR-17 מקצה לקצה:** יצירת מחיר, יצירת הזמנה, אישורה, שינוי המחיר, ואימות ש־`Publication.price` לא השתנה. הבדיקה תלויה בשלב 04 ונכתבת אחריו.
- `settings-rbac.spec.ts` — `sales` רואה מחירון לקריאה ולא יכול לערוך; `designer` נחסם מהגדרות.

## סטיות והכרעות שהתגלו במימוש

1. **גיאומטריה באחוזים** — כפי שהתוכנית הציעה, ונאכף בקוד: `width`/`height` הם 0–100 ו־`position` הוא `{x,y}` באחוזים. `slot-geometry.ts` מתעד זאת, ויש בדיקה שמוכיחה שאותו סלוט נשאר תקף ב־A4 וב־A3 ומתורגם למידות שונות.
2. **מחיר ריק אינו ₪0.** תא ריק במטריצה מוחק את ה־`PriceRule` ולא שומר אפס — אפס הוא מחיר אמיתי (פרסום חינם הוא החלטה), וריק הוא היעדר ברירת מחדל. שתי הסמנטיקות מובחנות ב־UI: תא לא־מותר מקווקו ואין בו קלט כלל.
3. **`(list)` route group גם כאן.** אותו לקח משלב 02 — `loading.tsx` חל על כל תת־העץ ומשדר 200 לפני שגוף העמוד רץ, מה שהיה מונע 404 אמיתי על מזהה של עסק אחר.
4. **חסימת החפיפה נאכפת בשרת** ב־`lib/data/templates.ts`, מול הגיאומטריה שבמסד. ההדגשה האדומה בקנבס היא משוב בלבד. הבדיקה מאמתת שאחרי ניסיון חופף ורענון עדיין קיים סלוט אחד בלבד.
5. **מצב הגרירה נשמר ב־state ולא רק ב־ref** — קריאת `ref.current` בזמן רינדור אסורה ב־React, וה־lint תפס את זה.

**שתי מלכודות בדיקה שנתקלנו בהן:** אותו `data-testid` שימש גם שדה קלט וגם כותרת, ובדיקה שציירה מפינת 0,0 נחתה על גבול הקנבס. שתיהן נראו כמו באג במוצר ולא היו.

## Definition of Done

- [x] Admin יוצר עיתון מלא ומגדיר לו סוגי עמודים, צורות מותרות ומחירון.
- [x] `max_ad_file_size` נשמר לכל עיתון בנפרד ואין מספר קשיח בקוד.
- [x] עורך התבנית מאפשר ציור, הזזה ושינוי גודל של סלוטים, ו**חוסם חפיפה בשרת** — לא רק ב־UI.
- [x] סלוט מוגבל לצורות פרסום שהוגדרו כמותרות לסוג העמוד שלו.
- [x] מחיקת סוג עמוד או צורה בשימוש נחסמת עם הודעה שמסבירה איפה היא בשימוש.
- [x] `width`/`height`/`position` נשמרים באחוזים ומתועדים ככאלה בקוד.
- [x] מטריצת המחירון מציגה תאים לא־מותרים כמושבתים.
- [x] `slot-geometry.ts` נבדק ביחידות ומשותף לשלב 06.
- [x] אין בשום מסך dpi, CMYK או bleed.
