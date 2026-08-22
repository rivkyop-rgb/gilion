# שלב 05 — קבצי מודעות

## מטרה

בסוף השלב משתמש מעלה קובץ מודעה, המערכת מוודאת שהוא תקין ובגודל המותר לעיתון, משייכת אותו ללקוח ולפרסום — והפרסום עובר אוטומטית מ"חסר חומר" ל"מוכן לשיבוץ".

## תלויות

02 (לקוחות), 03 (`max_ad_file_size`), 04 (פרסומים לשיוך).

## מקורות באפיון

US-005 · FR-15 · FR-21 · FR-5 · ישות: `Advertisement`

## Scope

**נכנס:** העלאה ל־MinIO · ולידציית סוג, גודל ותקינות · יצירת תצוגה מקדימה · שיוך ללקוח · שיוך לפרסום · החלפת קובץ עם שמירת גרסה קודמת אחת · השפעה על סטטוס הפרסום · ספריית מודעות עם גריד/רשימה.

**לא נכנס:** עריכת מודעה או חיתוך · ולידציית dpi, CMYK או bleed — **המצאות של Stitch** · "הערות לגרפיקה" — לא קיים ב־ERD · יותר מגרסה קודמת אחת (US-005 AC-5 מגביל מפורשות) · מגבלה קשיחה של 10MB או 100MB — היא מגיעה מ־`Newspaper.max_ad_file_size` בלבד (FR-21) · העלאה מהפורטל (09, משתמש באותה פעולה).

## מודל נתונים

`Advertisement` — `id`, `business_id`, `customer_id?`, `uploaded_by_user_id`, `name`, `file_type: [pdf, jpg, png]`, `file_size: Int`, `file_url`, `original_file_url`, `previous_file_url?`, `preview_url?`, `status: [valid, invalid, archived]`, `validation_status: [pending, passed, failed]`, `validation_error?`, `uploaded_at`, timestamps.

```prisma
@@index([business_id, customer_id])
@@index([business_id, status, validation_status])
@@index([business_id, uploaded_at(sort: Desc)])
```

**שדות ה־URL — הבחנה שחייבת להיות ברורה:**

- `original_file_url` — **הקובץ המקורי, לעולם לא נדרס.** דרישה מפורשת ב־US-005 AC-3.
- `file_url` — הקובץ הפעיל, זה שנכנס ל־PDF.
- `previous_file_url` — הגרסה הקודמת. **אחת בלבד** (US-005 AC-5); החלפה שלישית דורסת אותה.
- `preview_url` — PNG שנוצר בהעלאה, "כאשר ניתן".

**כל הערכים האלה הם מפתחות MinIO, לא URL ציבורי** (`conventions.md` §5).

**Cascade:** `Advertisement → Publication` = `SetNull` — מחיקת מודעה משאירה את הפרסום עומד בלי מודעה ומחזירה אותו ל־`missing_ad`, לא מוחקת אותו. `Customer → Advertisement` = `Restrict`.

## מסלולים ופעולות

| מסלול                     | תיאור                                               |
| ------------------------- | --------------------------------------------------- |
| `GET /ads`                | ספריית מודעות — גריד או רשימה                       |
| `GET /ads/[id]`           | פרטי מודעה                                          |
| `GET /api/files/[...key]` | Route Handler יחיד לכל הקבצים (`conventions.md` §5) |

**Server Actions:** `uploadAdvertisement(formData)` · `assignAdToCustomer(adId, customerId)` · `linkAdToPublication(adId, publicationId)` · `unlinkAdFromPublication(publicationId)` · `replaceAdFile(adId, file)` · `revertToPrevious(adId)` · `archiveAd(adId)`.

**צנרת ההעלאה** (`lib/storage/upload.ts`) — שבעה שלבים, ובסדר הזה:

1. סיומת וגודל מ־`Content-Length` — **דחייה מוקדמת** לפני קריאת הקובץ כולו.
2. אימות **magic bytes**, לא סיומת. `%PDF`, `\xFF\xD8\xFF`, `\x89PNG`.
3. `max_ad_file_size` של העיתון הרלוונטי (FR-21).
4. פתיחה בפועל — PDF דרך `pdf-lib`, תמונה דרך `sharp`. כישלון = `validation_status: 'failed'` עם הודעה.
5. כתיבה ל־MinIO תחת `{businessId}/ads/{adId}/original.{ext}`; `file_url` מצביע לאותו אובייקט.
6. יצירת תצוגה מקדימה — עמוד 1 של PDF או resize של תמונה, ל־`preview.png`.
7. `validation_status: 'passed'`, `status: 'valid'`.

## מסכים

**בסיס:** [`../design/screens/05-file-management.md`](../design/screens/05-file-management.md). הפריסה נשארת, התוכן מוחלף.

1. **ספריית מודעות** — מתג גריד/רשימה. כרטיס מודעה לפי `components.md`: תמונה ממוזערת, שם קובץ, שם לקוח, שורת מטא־דאטה ב־`label-sm` מונו (סוג + גודל), ותחתית עם אווטאר המעלה + זמן.
   - קובץ עם `validation_status: 'failed'` — גבול `error`, פס אדום בצד, ובאנר שגיאה עם `validation_error` בעברית.
   - **badge "ללא לקוח"** על מודעה בלי `customer_id`, עם הסבר שהיא אינה זמינה לשיבוץ (US-005 AC-4). חסר בעיצוב הקיים ([`../design/gaps.md`](../design/gaps.md) §ה).
   - סינון: לקוח, סטטוס, סוג קובץ, טווח תאריכים; וצ'יפ מהיר "ללא לקוח".

2. **אזור העלאה** — הרכיב מ־`components.md` נשאר: גבול מקווקו, `cloud_upload` בעיגול, גרירה או בחירה. **כרטיס הדרישות שלצידו מוחלף לגמרי:** במקום `300dpi / CMYK / bleed 5mm` מוצגים רק הפורמטים המותרים (PDF, JPG, PNG) ו־`max_ad_file_size` **של העיתון שנבחר**, נטען דינמית. אם לא נבחר עיתון — מוצג הערך הקטן ביותר מבין עיתוני העסק, עם הערה.

3. **פרטי מודעה** — פאנל צד: תצוגה מקדימה גדולה, מטא־דאטה, בורר לקוח, רשימת הפרסומים שמשתמשים במודעה, וכפתור "החלפת קובץ". כשקיימת `previous_file_url` מוצג בלוק "גרסה קודמת" עם תאריך וכפתור "שחזור".

4. **שיוך מודעה לפרסום** — נגיש משני הכיוונים: מכרטיס המודעה ומשורת הפרסום. מודאל עם חיפוש, שמציג **רק** פרסומים של אותו לקוח בסטטוס `planned` או `missing_ad`.

## הרשאות

| פעולה              | admin | sales | designer | accounting | customer |
| ------------------ | :---: | :---: | :------: | :--------: | :------: |
| צפייה בספרייה      |  ✅   |  ✅   |    ✅    |     ❌     |    ❌    |
| העלאה              |  ✅   |  ✅   |    ✅    |     ❌     |    ❌    |
| שיוך ללקוח ולפרסום |  ✅   |  ✅   |    ✅    |     ❌     |    ❌    |
| החלפת קובץ ושחזור  |  ✅   |  ✅   |    ✅    |     ❌     |    ❌    |
| ארכוב              |  ✅   |  ✅   |    ❌    |     ❌     |    ❌    |
| הורדת קובץ         |  ✅   |  ✅   |    ✅    |     ❌     |    ❌    |

`accounting` לא ניגש לקבצים — אין לו צורך תפעולי בהם. הורדה עוברת דרך `/api/files/` שבודק tenant, role ובעלות לפני שהוא חותם presigned URL.

## כללי ולידציה

1. סוג קובץ: PDF, JPG, PNG בלבד — **לפי magic bytes**, לא לפי סיומת.
2. גודל ≤ `Newspaper.max_ad_file_size` של העיתון הרלוונטי. חריגה → "הקובץ גדול מהמותר לעיתון X (מקסימום Y MB)" (FR-21, US-005 AC-2).
3. קובץ שלא נפתח → `validation_status: 'failed'`, `status: 'invalid'`, והוא **לא זמין לשיבוץ** (US-005 AC-2).
4. **מודעה בלי `customer_id` אינה זמינה לשיבוץ** (US-005 AC-4). נאכף בשרת בשלב 06, לא רק כ־badge.
5. שיוך לפרסום דורש שהלקוח של המודעה = הלקוח של הפרסום.
6. **מודעה אחת יכולה לשמש כמה פרסומים** — אין `unique` על `advertisement_id` ב־`Publication`.
7. `original_file_url` **לעולם לא נדרס.** גם החלפה שלישית לא נוגעת בו.
8. החלפה מזיזה את `file_url` הנוכחי ל־`previous_file_url` ודורסת את הקודמת שם.
9. שחזור מחליף בין `file_url` ל־`previous_file_url`.
10. **השפעה על סטטוס הפרסום** (FR-5, `conventions.md` §3): שיוך מודעה תקינה ומשויכת ללקוח → `AD_LINKED` → `ad_received` → `ready_for_layout`. ניתוק → `AD_UNLINKED` → `missing_ad`.
11. מודעה משובצת בגיליון **פתוח** אפשר להחליף; בגיליון **סגור** — חסום (`conventions.md` §7).
12. ארכוב נחסם כשהמודעה משובצת בגיליון פעיל.

## בדיקות

**Vitest:**

- `file-validation.test.ts` — magic bytes לכל שלושת הסוגים; PDF מזויף עם סיומת `.pdf` נדחה; גודל מול מגבלות שונות של עיתונים שונים.
- `ad-versioning.test.ts` — החלפה ראשונה, שנייה ושלישית; `original` נשמר בכל אחת; רק גרסה קודמת אחת נשמרת.
- `ad-publication-link.test.ts` — מעברי סטטוס בשיוך ובניתוק; מודעה בלי לקוח לא מאפשרת מעבר ל־`ready_for_layout`.

**Playwright:**

- `ad-upload.spec.ts` — העלאת PDF, JPG ו־PNG תקינים; תצוגה מקדימה נוצרת (US-005 AC-1, AC-3).
- `ad-upload-invalid.spec.ts` — קובץ פגום, קובץ שחורג מהמגבלה, וסוג לא נתמך — שלושתם מציגים שגיאה והקובץ **לא זמין לשיבוץ** (US-005 AC-2).
- `ad-size-per-newspaper.spec.ts` — **מאמת FR-21:** אותו קובץ 8MB עובר בעיתון עם מגבלת 10MB ונדחה בעיתון עם 5MB.
- `ad-no-customer.spec.ts` — מודעה בלי לקוח מסומנת ואינה ניתנת לשיבוץ (US-005 AC-4).
- `ad-replace.spec.ts` — החלפה שומרת גרסה קודמת אחת ומאפשרת שחזור (US-005 AC-5).
- `file-access.spec.ts` — **בדיקת אבטחה:** משתמש מעסק אחר מנסה `/api/files/{otherBusinessId}/ads/...` → 404. presigned URL פג אחרי 5 דקות (FR-15).

## Definition of Done

- [ ] העלאת PDF, JPG ו־PNG עובדת, ונוצרת תצוגה מקדימה לכל אחד.
- [ ] הולידציה בודקת magic bytes ולא סיומת.
- [ ] המגבלה נלקחת מ־`Newspaper.max_ad_file_size` — **אין שום מספר קשיח בקוד** (FR-21).
- [ ] קובץ פגום מסומן ואינו זמין לשיבוץ.
- [ ] מודעה בלי לקוח מסומנת ואינה זמינה לשיבוץ.
- [ ] `original_file_url` נשמר לנצח; נשמרת גרסה קודמת אחת בלבד; שחזור עובד.
- [ ] שיוך וניתוק מודעה מזיזים את סטטוס הפרסום דרך מכונת המצבים בלבד.
- [ ] מודעה אחת משמשת כמה פרסומים.
- [ ] אף URL של קובץ לא נחשף; הגישה רק דרך `/api/files/` עם presigned קצר־מועד.
- [ ] בדיקת בידוד הקבצים בין עסקים עוברת.
- [ ] כרטיס הדרישות מציג רק פורמטים וגודל מקסימלי — **אין dpi, CMYK או bleed**.
