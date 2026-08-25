# שלב 04 — הזמנות ופרסומים

## מטרה

בסוף השלב נציג מכירות בונה הזמנה של כמה פרסומים, רואה תצוגה מקדימה של בדיוק מה ייווצר, שומר כטיוטה — ורק באישור נוצרים פרסומים מחייבים עם המחיר שננעל.

## תלויות

02 (לקוחות), 03 (עיתונים, צורות, מחירון).

## מקורות באפיון

US-003 · US-004 · FR-3 · FR-4 · FR-5 · FR-19 · ישויות: `AdOrder`, `AdOrderItem`, `Publication`

## Scope

**נכנס:** יצירת הזמנה עם שורות · תצוגה מקדימה של הפרסומים שייווצרו · מילוי מחיר אוטומטי מ־`PriceRule` · חישוב סכום כולל · שמירה כטיוטה · רשימת הזמנות · אישור/דחייה עם סיבת דחייה · יצירת `Publication` טרנזקציונית · שלוש מכונות המצבים · ביטול פרסום · סימון הזמנה כ־Completed.

**לא נכנס:** מע"מ ו"עמלת משריך" — **המצאות של Stitch** ([`../design/gaps.md`](../design/gaps.md) §א); `AdOrder.total_price` הוא סכום יחיד · הנחות · חבילות פרסום (out of scope ב־PRD) · שיבוץ (06) · תשלום בפועל (08) · הגשה מהפורטל (09 — משתמש באותן פעולות).

## מודל נתונים

`AdOrder` — `id`, `business_id`, `customer_id`, `source: [internal, customer_portal]`, `status: [draft, pending_approval, approved, rejected, canceled, completed]`, `rejection_reason?`, `total_price: Decimal`, `payment_status: [unpaid, partially_paid, paid, debt]`, `external_invoice_number?`, `approved_at?`, `completed_at?`, timestamps.

`AdOrderItem` — `id`, `order_id`, `newspaper_id`, `ad_shape_id`, `publication_date: Date`, `price: Decimal`, timestamps. **פלוס `page_type_id`** — לא ב־ERD, אבל נדרש כי `PriceRule` ממופתח ב־`(newspaper, page_type, ad_shape)`. בלעדיו אי אפשר לגזור מחיר. מתועד כתוספת מימוש.

`Publication` — `id`, `business_id`, `order_id`, `order_item_id?`, `customer_id`, `newspaper_id`, `ad_shape_id`, `advertisement_id?`, `publication_date`, `price`, `source`, `status` (8 ערכים), `placement_status: [not_placed, placed]`, `payment_status`, timestamps.

```prisma
@@index([business_id, status])                        // AdOrder
@@index([business_id, customer_id, created_at])        // AdOrder
@@index([order_id])                                    // AdOrderItem
@@index([business_id, publication_date, status])       // Publication — שאילתת הדשבורד
@@index([business_id, newspaper_id, publication_date]) // Publication — פתיחת גיליון
@@index([business_id, customer_id])                    // Publication
@@index([advertisement_id])                            // Publication
@@unique([order_item_id])                              // שורת תכנון → פרסום אחד לכל היותר
```

`@@unique([order_item_id])` הוא מה שהופך את האישור ל**אידמפוטנטי**: לחיצה כפולה על "אשר" לא תיצור פרסומים כפולים.

## מסלולים ופעולות

| מסלול               | תיאור                                 |
| ------------------- | ------------------------------------- |
| `GET /orders`       | רשימת הזמנות עם סינון לפי סטטוס ומקור |
| `GET /orders/new`   | בונה ההזמנה                           |
| `GET /orders/[id]`  | כרטיס הזמנה — כולל אישור/דחייה        |
| `GET /publications` | רשימת פרסומים עם סינונים              |

**Server Actions:**

- `createOrderDraft(input)` · `updateOrderDraft(id, input)` · `addOrderItem` · `updateOrderItem` · `removeOrderItem`
- `previewPublications(orderId)` — מחזיר את מה שייווצר **בלי לכתוב כלום**. הדרישה המפורשת מ־US-003 שהעיצוב פספס ([`../design/gaps.md`](../design/gaps.md) §ה).
- `submitOrder(id)` — `draft → pending_approval`
- `approveOrder(id)` — **הפעולה המרכזית בשלב.** טרנזקציה אחת: מאמת → `approved` + `approved_at` → יוצר `Publication` לכל `AdOrderItem` עם `price` מועתק → `withAudit('approve_order')`.
- `rejectOrder(id, reason?)` — `rejection_reason` אופציונלי (FR-19) · `withAudit('reject_order')`
- `cancelOrder(id)` · `completeOrder(id)`
- `cancelPublication(id)` — `withAudit('cancel_publication')`
- `getPriceSuggestion(newspaperId, pageTypeId, adShapeId)` — קורא `PriceRule`, ניתן לדריסה ידנית.

## מסכים

1. **בונה הזמנה** — הפריסה מ־[`../design/screens/03-new-order.md`](../design/screens/03-new-order.md), עם התוכן המומצא מוחלף:
   - חיפוש לקוח **בלי שדה ח.פ** (לא קיים ב־ERD).
   - שורות ההזמנה: לכל שורה עיתון, סוג עמוד, צורת פרסום, תאריך פרסום ומחיר. בחירת עיתון מסננת את סוגי העמודים, ובחירת סוג עמוד מסננת את הצורות ל־`AllowedAdShape` בלבד. המחיר נטען אוטומטית מ־`PriceRule` ומסומן "מחיר בסיסי" עד שנדרס ידנית — אז הוא מסומן "מחיר מותאם".
   - **תצוגה מקדימה של הפרסומים שייווצרו** — כרטיס נפרד מתחת לשורות, טבלה של כל פרסום עתידי עם לקוח, עיתון, תאריך, גודל ומחיר, וכותרת "N פרסומים ייווצרו לאחר אישור ההזמנה". זו התוספת המרכזית מול העיצוב הקיים.
   - סיכום: **סכום כולל יחיד**, ללא מע"מ וללא עמלות.
   - פעולות: secondary "שמור טיוטה" · primary "שלח לאישור".
   - באנר מתמיד: "הזמנה בטיוטה אינה יוצרת פרסומים מחייבים ואינה נדרשת לשיבוץ" (US-003 AC-5).

2. **רשימת הזמנות** — טבלה צפופה: מספר הזמנה (`label-sm` מונו, `dir="ltr"`) · לקוח עם אווטאר · מקור (badge — "פנימי" ניטרלי, "פורטל לקוח" ב־`state-active`) · מספר פרסומים · סכום · סטטוס · תאריך. שורת `pending_approval` מקבלת רקע עדין ואת פעולות האישור/דחייה ישירות בשורה. צ'יפי סינון לפי סטטוס עם ספירה.

3. **כרטיס הזמנה** — כותרת עם מספר וסטטוס, פרטי לקוח, טבלת השורות, סכום. ל־`pending_approval` — סרגל פעולות דביק בתחתית: primary "אשר הזמנה" · secondary "דחה". "דחה" פותח מודאל עם `textarea` לסיבה ומשפט מפורש שהסיבה **אופציונלית** ותוצג ללקוח (FR-19). אחרי אישור מוצגים הפרסומים שנוצרו, והשורות נעולות.

4. **רשימת פרסומים** — הטבלה המרכזית של המערכת, נקראת גם מהדשבורד עם סינון מוקדם. עמודות: לקוח · עיתון · תאריך · צורת פרסום · **מקור פרסום** · **סטטוס פרסום** · סטטוס שיבוץ · סטטוס מודעה · סטטוס תשלום (מוסתר ל־designer). שתי העמודות המודגשות חסרות בעיצוב הקיים ונדרשות ב־US-001. סינון לפי עיתון, טווח תאריכים, לקוח וסטטוס. שורה עם `missing_ad` או `not_placed` מסומנת ברקע אדמדם עדין.

## הרשאות

| פעולה              | admin | sales | designer | accounting | customer |
| ------------------ | :---: | :---: | :------: | :--------: | :------: |
| יצירה ועריכת טיוטה |  ✅   |  ✅   |    ❌    |     ❌     |    ❌    |
| שליחה לאישור       |  ✅   |  ✅   |    ❌    |     ❌     |    ❌    |
| **אישור / דחייה**  |  ✅   |  ✅   |    ❌    |     ❌     |    ❌    |
| ביטול הזמנה        |  ✅   |  ✅   |    ❌    |     ❌     |    ❌    |
| סימון Completed    |  ✅   |  ❌   |    ❌    |     ✅     |    ❌    |
| צפייה בפרסומים     |  ✅   |  ✅   |    ✅    |     ✅     |    ❌    |
| ביטול פרסום        |  ✅   |  ✅   |    ❌    |     ❌     |    ❌    |

`designer` רואה פרסומים (הוא צריך לשבץ אותם) אבל לא נוגע בהזמנות ולא בעמודת התשלום.

## כללי ולידציה

**הזמנה** (`lib/domain/order.ts`):

1. חובה `customer_id` ולפחות שורה אחת לפני שליחה לאישור.
2. `publication_date` לא בעבר בעת יצירה. עריכת טיוטה ישנה מזהירה ולא חוסמת.
3. `ad_shape_id` חייב להיות ב־`AllowedAdShape` של `page_type_id` הנבחר.
4. `price` ≥ 0. ריק → נלקח מ־`PriceRule`; אין `PriceRule` → הזנה ידנית חובה.
5. `total_price` = סכום השורות. **מחושב בשרת בלבד**, לעולם לא נלקח מהלקוח.
6. עריכת שורות מותרת רק ב־`draft` ו־`pending_approval`.

**מעברי סטטוס** (`lib/domain/order-status.ts`, `conventions.md` §3): 7. `draft → pending_approval → approved | rejected`; `approved → completed`; `canceled` מכל מצב פרט ל־`completed`. 8. **`approved` חד־כיווני** — הזמנה מאושרת לא חוזרת לטיוטה. כבר נוצרו ממנה התחייבויות. 9. `completed` רק כאשר **כל** הפרסומים בהזמנה במצב `published` או `canceled` (US-004 AC-5). 10. `rejection_reason` אופציונלי; אם הוזן — מוצג ללקוח בפורטל (FR-19).

**אישור ויצירת פרסומים** — הלב של השלב: 11. הכל בטרנזקציה אחת. כשל בפרסום אחד מבטל את כל האישור. 12. כל `Publication` מקבל `status = 'planned'`, `placement_status = 'not_placed'`, `payment_status = 'unpaid'`. 13. **`price` מועתק מ־`AdOrderItem` ונעול.** שינוי `PriceRule` מאוחר יותר לא נוגע בו (FR-17, `conventions.md` §7). 14. `source` מועתק מההזמנה. 15. אידמפוטנטי — `@@unique([order_item_id])` מונע פרסומים כפולים מלחיצה כפולה.

**פרסום** (`lib/domain/publication-status.ts`): 16. תשע המעברים מטבלת המצבים ב־`conventions.md` §3. 17. `canceled` מכל מצב פרט ל־`published`. פרסום שכבר יצא לדפוס לא מבוטל. 18. ביטול פרסום משובץ **מסיר גם את השיבוץ** באותה טרנזקציה.

## בדיקות

**Vitest:**

- `order-status.test.ts` — מטריצת 6×6 של כל המעברים; חד־כיווניות `approved`; `completed` נחסם כשיש פרסום פעיל.
- `publication-status.test.ts` — כל 9 האירועים; `published → canceled` נחסם; המסלול המלא `planned → missing_ad → ad_received → ready_for_layout → placed → published → billed`.
- `order-total.test.ts` — חישוב סכום, כולל עיגול ושורה בלי `PriceRule`.
- `approve-order.test.ts` — יוצר N פרסומים מ־N שורות; מעתיק מחיר; אידמפוטנטי.

**Playwright:**

- `order-10-publications.spec.ts` — **קריטריון הצלחה מ־PRD §7:** יצירת הזמנה של 10 פרסומים, תצוגה מקדימה, אישור — הכל תוך פחות מ־3 דקות, נמדד בבדיקה.
- `order-draft-no-publications.spec.ts` — טיוטה לא יוצרת פרסומים ולא מופיעה ברשימת הפרסומים (US-003 AC-5).
- `order-approve.spec.ts` — אישור יוצר בדיוק N פרסומים עם המחירים הנכונים ורושם AuditLog (US-004).
- `order-reject.spec.ts` — דחייה עם סיבה ובלי סיבה; שתיהן עוברות (FR-19).
- `pricing-immutability.spec.ts` — משלב 03: שינוי `PriceRule` אחרי אישור לא משנה `Publication.price` (FR-17).
- `order-complete.spec.ts` — `completed` נחסם עוד לפני שכל הפרסומים סגורים, ומצליח אחר כך.

## סטיות והכרעות שהתגלו במימוש

1. **`AdOrderItem.page_type_id` — תוספת מימוש מתועדת.** אינה ב־ERD, אבל `PriceRule` ממופתח ב־`(newspaper, page_type, ad_shape)`; בלעדיה אין מאיפה לגזור מחיר. FK מורכב על `(id, newspaper_id)` לפי `conventions.md` §2, כך ששורה שמצליבה סוג עמוד של עיתון אחד עם צורה של אחר אינה ניתנת לייצוג במסד.

2. **הצעת המחיר האסינכרונית דרסה מחיר שהוקלד — באג אמיתי.** הטופס טוען מחיר בסיסי ב־round trip; מחיר שהמשתמשת הקלידה בזמן שהבקשה בדרך הוחלף בשקט כשההצעה נחתה. התגלה כשבדיקה שהקלידה 1200 ו־800 יצרה שתי שורות של 800. התיקון: `typedPrice` ref שמנצח הצעה ממתינה עד שהצירוף עצמו משתנה.

   **וגלגול שני של אותו תיקון היה שגוי:** ההגנה חלה גם על `setSuggested`, ולכן המסך לא ידע מה המחיר הבסיסי ולא הצליח לומר "מחיר מותאם". ההגנה חלה על **השדה בלבד** — ידיעת המחיר הבסיסי תמיד נרשמת.

3. **`publications` הוא אזור RBAC נפרד מ־`orders`.** טבלת ההרשאות נותנת ל־`designer` צפייה בפרסומים ואפס גישה להזמנות; אזור אחד לשניהם לא יכול לבטא את זה. TypeScript אכף את התוספת — הוספת האזור שברה את שתי הטבלאות (המימוש והבדיקה) עד שעודכנו.

4. **`tenant-models.ts` ציפה ל־relation בשם `ad_order`.** הרישום נכתב מול התוכנית לפני שהסכימה נכתבה, והסכימה קוראת ל־relation `order`. התוצאה: השורה נוצרה אבל חישוב הסכום נכשל. אומת אחרי התיקון שעסק ב' רואה 0 שורות.

5. **בדיקות E2E לא מקבעות מצב גלובלי.** בדיקה שווידאה "טיוטה לא יוצרת פרסומים" בדקה שטבלת הפרסומים ריקה — והיא לא, כי ריצות קודמות השאירו הזמנות מאושרות. האסרציה עברה למספר ההזמנה של הטיוטה עצמה. באותו אופן, בדיקה שהניחה שאין מחיר בסיסי לצירוף ברירת המחדל נכשלה כי בדיקות שלב 03 מילאו תאים במטריצה. **מצב שמצטבר בין ריצות הוא חלק מהסביבה, לא חריגה.**

6. **`(list)` route group גם כאן** — אותו לקח משלבים 02 ו־03: `loading.tsx` חל על כל תת־העץ ומשדר 200 לפני שגוף העמוד רץ, מה שהיה מונע 404 אמיתי על מזהה של עסק אחר.

8. **FR-17 נבדק מול המסד ולא מול הדפדפן.** הגרסה הראשונה של `pricing-immutability.spec.ts` הלכה דרך ארבעה מסכים ושתי כניסות, ונפלה ב־timeout של שלוש דקות על `page.goto` למחירון — היא מדדה את זמן ההידור של שרת הפיתוח, לא את הכלל. הכלל עצמו הוא **מספר שמור**, ולכן הוא נבדק במקום שבו המספר חי: אישור, הזזת המחירון, וקריאת ה־`Publication` בחזרה. ב־E2E נשאר רק מה שבאמת דורש דפדפן — חסימת ההשלמה, שתלויה במי מחובר.

9. **הידור ראשון של מסלול בסביבת הפיתוח לוקח 10–15 שניות**, ומקביליות של כמה דפדפני בדיקה מנפחת אותו לדקות. ריצת בדיקה אחת בכל פעם היא תנאי, לא העדפה.

## Definition of Done

- [x] הזמנה נשמרת כטיוטה בלי ליצור פרסום מחייב אחד.
- [x] התצוגה המקדימה מציגה בדיוק מה ייווצר — לקוח, עיתון, תאריך, גודל, מחיר — לפני האישור.
- [x] מחיר נטען אוטומטית מ־`PriceRule` וניתן לדריסה ידנית, עם חיווי ויזואלי מי מהם.
- [x] אישור יוצר פרסומים בטרנזקציה אחת ורושם AuditLog; כשל מבטל הכל.
- [x] לחיצה כפולה על "אשר" לא יוצרת פרסומים כפולים.
- [x] דחייה עם סיבה ובלי סיבה — שתיהן עובדות (FR-19).
- [x] שינוי `PriceRule` אחרי אישור לא משנה שום `Publication.price` — מאומת ב־`lib/data/price-immutability.test.ts` מול הערך השמור (ראה סטייה 8).
- [x] שלוש מכונות המצבים נבדקות ביחידות, וכל 22 המעברים החוקיים מכוסים.
- [x] `Completed` נחסם כל עוד יש פרסום פעיל.
- [x] רשימת הפרסומים כוללת עמודות "סטטוס פרסום" ו"מקור פרסום" (US-001).
- [x] אין בשום מסך מע"מ או עמלות.
