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

## Definition of Done

- [ ] הזמנה נשמרת כטיוטה בלי ליצור פרסום מחייב אחד.
- [ ] התצוגה המקדימה מציגה בדיוק מה ייווצר — לקוח, עיתון, תאריך, גודל, מחיר — לפני האישור.
- [ ] מחיר נטען אוטומטית מ־`PriceRule` וניתן לדריסה ידנית, עם חיווי ויזואלי מי מהם.
- [ ] אישור יוצר פרסומים בטרנזקציה אחת ורושם AuditLog; כשל מבטל הכל.
- [ ] לחיצה כפולה על "אשר" לא יוצרת פרסומים כפולים.
- [ ] דחייה עם סיבה ובלי סיבה — שתיהן עובדות (FR-19).
- [ ] שינוי `PriceRule` אחרי אישור לא משנה שום `Publication.price` — מאומת ב־E2E.
- [ ] שלוש מכונות המצבים נבדקות ביחידות, וכל 22 המעברים החוקיים מכוסים.
- [ ] `Completed` נחסם כל עוד יש פרסום פעיל.
- [ ] רשימת הפרסומים כוללת עמודות "סטטוס פרסום" ו"מקור פרסום" (US-001).
- [ ] אין בשום מסך מע"מ או עמלות.
