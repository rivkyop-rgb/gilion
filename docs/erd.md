ERD: Gilion

1. Overview

מודל ה־MVP מתאר מערכת SaaS רב־עסקית לניהול לקוחות, עיתונים, הזמנות פרסום, פרסומים, מודעות, גיליונות, שיבוצים, PDF סופי, תזכורות, תשלומים ידניים ולוג ביקורת. גזירים, חבילות פרסום, הפקת חשבוניות אוטומטית והרשאות מותאמות אישית אינם חלק מה־MVP ולכן לא נכללים במודל.

2. Mermaid Diagram
3. Entities
   Business

Purpose: עסק עצמאי במערכת ה־SaaS.
Source: FR-1, FR-2

Field Type Required Notes
id string yes Primary key
name string yes
created_at datetime yes
updated_at datetime yes
User

Purpose: משתמש פנימי או משתמש לקוח.
Source: FR-2, FR-8, FR-9, US-009

Field Type Required Notes
id string yes Primary key
name string yes
email string yes
user_type enum: [internal, customer] yes
created_at datetime yes
updated_at datetime yes
UserMembership

Purpose: שיוך משתמש לעסק ולתפקיד בסיסי קבוע.
Source: FR-2, FR-8, FR-9

Field Type Required Notes
id string yes Primary key
user_id reference: User yes
business_id reference: Business yes
customer_id reference: Customer no נדרש למשתמש Customer
role enum: [admin, sales, designer, accounting, customer] yes
status enum: [active, inactive] yes
created_at datetime yes
updated_at datetime yes
Customer

Purpose: לקוח קבוע או מזדמן.
Source: US-002, US-005, US-009, US-010

Field Type Required Notes
id string yes Primary key
business_id reference: Business yes
customer_type enum: [regular, casual] yes
business_name string no
contact_name string yes
phone string no טלפון או מייל נדרשים ללקוח מזדמן
email string no טלפון או מייל נדרשים ללקוח מזדמן
created_at datetime yes
updated_at datetime yes
Newspaper

Purpose: עיתון שמנוהל תחת עסק.
Source: US-006, US-007, US-009, FR-21

Field Type Required Notes
id string yes Primary key
business_id reference: Business yes
name string yes
page_size string yes
margin decimal yes
print_quality string yes
logo_url string no
fixed_banner_url string no
max_ad_file_size integer yes מוגדר לכל עיתון בנפרד
created_at datetime yes
updated_at datetime yes
PageType

Purpose: סוג עמוד בעיתון.
Source: US-006, US-007

Field Type Required Notes
id string yes Primary key
newspaper_id reference: Newspaper yes
name string yes שער, אחורי, פנימי, פרימיום, מרכזי
created_at datetime yes
updated_at datetime yes
AdShape

Purpose: צורת פרסום מוגדרת מראש.
Source: US-006, US-007, US-009

Field Type Required Notes
id string yes Primary key
name string yes
size_group enum: [eighth, quarter, half, full, strip, other] yes
created_at datetime yes
updated_at datetime yes
AllowedAdShape

Purpose: צורת פרסום מותרת עבור סוג עמוד.
Source: US-006, US-007

Field Type Required Notes
id string yes Primary key
page_type_id reference: PageType yes
ad_shape_id reference: AdShape yes
created_at datetime yes
updated_at datetime yes
PriceRule

Purpose: מחיר בסיסי לפי עיתון, סוג עמוד וצורת פרסום.
Source: US-003, US-006, FR-17

Field Type Required Notes
id string yes Primary key
newspaper_id reference: Newspaper yes
page_type_id reference: PageType yes
ad_shape_id reference: AdShape yes
price decimal yes
created_at datetime yes
updated_at datetime yes
LayoutTemplate

Purpose: תבנית או גריד שיבוץ לעיתון.
Source: US-006, US-007, FR-14

Field Type Required Notes
id string yes Primary key
newspaper_id reference: Newspaper yes
name string yes
created_at datetime yes
updated_at datetime yes
TemplatePage

Purpose: עמוד בתוך תבנית שיבוץ.
Source: US-006, US-007

Field Type Required Notes
id string yes Primary key
layout_template_id reference: LayoutTemplate yes
page_type_id reference: PageType yes
page_number integer yes
created_at datetime yes
updated_at datetime yes
TemplateSlot

Purpose: אזור שיבוץ מוגדר מראש בתוך עמוד תבנית.
Source: US-006, US-007, FR-14

Field Type Required Notes
id string yes Primary key
template_page_id reference: TemplatePage yes
ad_shape_id reference: AdShape yes
position string yes
width decimal yes
height decimal yes
created_at datetime yes
updated_at datetime yes
AdOrder

Purpose: הזמנת פרסום, כולל טיוטה, בקשת פורטל לקוח ואישור פנימי.
Source: US-003, US-004, US-009, US-010

Field Type Required Notes
id string yes Primary key
business_id reference: Business yes
customer_id reference: Customer yes
source enum: [internal, customer_portal] yes
status enum: [draft, pending_approval, approved, rejected, canceled, completed] yes
rejection_reason text no אופציונלי בדחיית בקשת לקוח
total_price decimal yes סכום כולל מחושב
payment_status enum: [unpaid, partially_paid, paid, debt] yes
external_invoice_number string no מספר ידני, ללא הפקת חשבונית
approved_at datetime no
completed_at datetime no
created_at datetime yes
updated_at datetime yes
AdOrderItem

Purpose: שורת תכנון בהזמנה לפני יצירת פרסום מחייב.
Source: US-003, US-004, US-009

Field Type Required Notes
id string yes Primary key
order_id reference: AdOrder yes
newspaper_id reference: Newspaper yes
ad_shape_id reference: AdShape yes
publication_date date yes ב־MVP בקשת לקוח כוללת תאריך אחד
price decimal yes
created_at datetime yes
updated_at datetime yes
Publication

Purpose: פרסום מחייב שנוצר רק לאחר אישור הזמנה.
Source: US-001, US-004, US-007, US-008, US-010

Field Type Required Notes
id string yes Primary key
business_id reference: Business yes
order_id reference: AdOrder yes
order_item_id reference: AdOrderItem no
customer_id reference: Customer yes
newspaper_id reference: Newspaper yes
ad_shape_id reference: AdShape yes
advertisement_id reference: Advertisement no ריק כאשר חסרה מודעה
publication_date date yes
price decimal yes מחיר בפועל בזמן אישור ההזמנה
source enum: [internal, customer_portal] yes
status enum: [planned, missing_ad, ad_received, ready_for_layout, placed, published, canceled, billed] yes
placement_status enum: [not_placed, placed] yes
payment_status enum: [unpaid, partially_paid, paid, debt] yes
created_at datetime yes
updated_at datetime yes
Advertisement

Purpose: קובץ מודעה המשויך ללקוח ויכול לשמש כמה פרסומים.
Source: US-005, US-007, US-009, FR-15, FR-21

Field Type Required Notes
id string yes Primary key
business_id reference: Business yes
customer_id reference: Customer no מודעה ללא לקוח אינה זמינה לשיבוץ
uploaded_by_user_id reference: User yes
name string yes
file_type enum: [pdf, jpg, png] yes
file_size integer yes
file_url string yes הקובץ הנוכחי
original_file_url string yes הקובץ המקורי
previous_file_url string no גרסה קודמת אחת בלבד ב־MVP
preview_url string no כאשר ניתן
status enum: [valid, invalid, archived] yes
validation_status enum: [pending, passed, failed] yes
validation_error text no קובץ פגום, גדול מדי או לא ניתן לפתיחה
uploaded_at datetime yes
created_at datetime yes
updated_at datetime yes
Issue

Purpose: גיליון של עיתון בתאריך מסוים.
Source: US-007, US-008, FR-6, FR-22

Field Type Required Notes
id string yes Primary key
business_id reference: Business yes
newspaper_id reference: Newspaper yes
issue_date date yes
status enum: [draft, in_layout, ready_for_print, closed] yes
final_pdf_url string no PDF סופי אחרון בלבד
closed_at datetime no
created_at datetime yes
updated_at datetime yes
IssuePage

Purpose: עמוד ממוספר בתוך גיליון.
Source: US-007, US-008

Field Type Required Notes
id string yes Primary key
issue_id reference: Issue yes
page_type_id reference: PageType yes
page_number integer yes
created_at datetime yes
updated_at datetime yes
Placement

Purpose: שיבוץ בפועל של פרסום ומודעה בעמוד ובאזור שיבוץ.
Source: US-007, US-008, FR-16

Field Type Required Notes
id string yes Primary key
publication_id reference: Publication yes
issue_page_id reference: IssuePage yes
advertisement_id reference: Advertisement yes
ad_shape_id reference: AdShape yes
template_slot_id reference: TemplateSlot no
position string yes
width decimal yes
height decimal yes
status enum: [placed, removed, published] yes
duplicate_override_approved boolean yes נדרש אם אותו פרסום שובץ יותר מפעם אחת בגיליון היעד
duplicate_override_approved_by_user_id reference: User no
duplicate_override_approved_at datetime no
created_at datetime yes
updated_at datetime yes
Reminder

Purpose: תזכורת נדרשת לפרסום שמתקרב וחסרה לו מודעה.
Source: US-001, FR-11

Field Type Required Notes
id string yes Primary key
publication_id reference: Publication yes
customer_id reference: Customer yes
status enum: [needed, approved_to_send, sent, failed] yes
sent_at datetime no
created_at datetime yes
updated_at datetime yes
PdfGenerationLog

Purpose: לוג הפקת PDF טיוטה או PDF סופי.
Source: US-008, FR-12, FR-13, FR-22

Field Type Required Notes
id string yes Primary key
issue_id reference: Issue yes
generated_by_user_id reference: User yes
pdf_type enum: [draft, final] yes
status enum: [generated, failed] yes
file_url string no PDF טיוטה אינו נשמר כהיסטוריה מחייבת
error_message text no
generated_at datetime yes
created_at datetime yes
updated_at datetime yes
Payment

Purpose: מעקב תשלום ידני מול לקוח והזמנה אחת.
Source: US-010, FR-7

Field Type Required Notes
id string yes Primary key
business_id reference: Business yes
customer_id reference: Customer yes
order_id reference: AdOrder no
updated_by_user_id reference: User yes
amount decimal yes סכום ששולם
payment_date date no
external_invoice_number string no מספר חשבונית חיצונית ידני
status enum: [unpaid, partially_paid, paid, debt, canceled] yes
created_at datetime yes
updated_at datetime yes
AuditLog

Purpose: לוג ביקורת לפעולות רגישות, כולל ערך קודם וחדש כאשר רלוונטי.
Source: FR-10, US-004, US-008, US-010

Field Type Required Notes
id string yes Primary key
business_id reference: Business yes
user_id reference: User yes
action enum: [approve_order, reject_order, cancel_publication, close_issue, generate_pdf, update_payment, override_duplicate_placement] yes
target_type string yes
target_id string yes
old_value json no
new_value json no
created_at datetime yes 4. Relationships

Business → Customer: one-to-many

Description: עסק מנהל לקוחות המשויכים אליו בלבד.
Cascade: restrict
Source: FR-1, US-002

Business → Newspaper: one-to-many

Description: עסק מנהל עיתון אחד או יותר.
Cascade: restrict
Source: FR-1, US-006

Business → UserMembership: one-to-many

Description: עסק מעניק גישה למשתמשים לפי תפקיד בסיסי.
Cascade: cascade
Source: FR-2, FR-8

User → UserMembership: one-to-many

Description: משתמש יכול להשתייך לעסק אחד או יותר.
Cascade: cascade
Source: FR-2

Customer → AdOrder: one-to-many

Description: לקוח מבצע הזמנות או בקשות פרסום מהפורטל.
Cascade: restrict
Source: US-003, US-004, US-009

AdOrder → AdOrderItem: one-to-many

Description: הזמנה כוללת שורת תכנון אחת או יותר.
Cascade: cascade
Source: US-003

AdOrder → Publication: one-to-many

Description: לאחר אישור הזמנה נוצרים פרסומים מחייבים.
Cascade: restrict
Source: US-004

AdOrderItem → Publication: zero-or-one

Description: שורת תכנון יכולה להפוך לפרסום מחייב לאחר אישור.
Cascade: restrict
Source: US-004

Customer → Advertisement: one-to-many

Description: לקוח מחזיק קבצי מודעות.
Cascade: restrict
Source: US-005

Advertisement → Publication: one-to-many

Description: מודעה אחת יכולה לשמש כמה פרסומים.
Cascade: set null
Source: US-005

Newspaper → PageType: one-to-many

Description: עיתון מגדיר סוגי עמודים.
Cascade: cascade
Source: US-006

PageType → AllowedAdShape: one-to-many

Description: סוג עמוד מתיר צורות פרסום מסוימות.
Cascade: cascade
Source: US-006

AdShape → AllowedAdShape: one-to-many

Description: צורת פרסום יכולה להיות מותרת בסוגי עמודים שונים.
Cascade: restrict
Source: US-006

Newspaper → PriceRule: one-to-many

Description: עיתון מחזיק מחירי פרסום בסיסיים לפי סוג עמוד וצורת פרסום.
Cascade: cascade
Source: US-006, FR-17

Newspaper → LayoutTemplate: one-to-many

Description: עיתון משתמש בתבניות או גרידים לשיבוץ.
Cascade: cascade
Source: US-006, US-007

LayoutTemplate → TemplatePage: one-to-many

Description: תבנית כוללת עמודים.
Cascade: cascade
Source: US-006, US-007

TemplatePage → TemplateSlot: one-to-many

Description: עמוד תבנית כולל אזורי שיבוץ.
Cascade: cascade
Source: US-006, US-007

Newspaper → Issue: one-to-many

Description: עיתון מפיק גיליונות.
Cascade: restrict
Source: US-007, US-008

Issue → IssuePage: one-to-many

Description: גיליון מורכב מעמודים ממוספרים.
Cascade: cascade
Source: US-007

IssuePage → Placement: one-to-many

Description: עמוד בגיליון מקבל שיבוצי מודעות.
Cascade: cascade
Source: US-007

Publication → Placement: one-to-many

Description: פרסום יכול להיות משובץ פעם אחת בגיליון היעד, או יותר רק באישור חריגה.
Cascade: restrict
Source: US-007, FR-16

TemplateSlot → Placement: one-to-many

Description: אזור שיבוץ מארח שיבוץ מודעה.
Cascade: restrict
Source: US-007, FR-16

Publication → Reminder: one-to-many

Description: פרסום חסר מודעה יכול להופיע ברשימת תזכורות נדרשות.
Cascade: cascade
Source: FR-11

Issue → PdfGenerationLog: one-to-many

Description: גיליון יכול לקבל לוגים של הפקת PDF טיוטה או סופי.
Cascade: cascade
Source: FR-12, FR-22

User → PdfGenerationLog: one-to-many

Description: משתמש מורשה מפיק PDF.
Cascade: restrict
Source: US-008

Customer → Payment: one-to-many

Description: תשלום נרשם מול לקוח.
Cascade: restrict
Source: US-010

AdOrder → Payment: one-to-many

Description: תשלום יכול להיות משויך להזמנה אחת.
Cascade: set null
Source: US-010

User → Payment: one-to-many

Description: משתמש מעדכן ידנית נתוני תשלום.
Cascade: restrict
Source: US-010

Business → AuditLog: one-to-many

Description: עסק שומר לוג ביקורת לפעולות רגישות.
Cascade: restrict
Source: FR-10

User → AuditLog: one-to-many

Description: משתמש מבצע פעולה שנרשמת בלוג ביקורת.
Cascade: restrict
Source: FR-10 5. Coverage Map
User Story Entities Involved
US-001 Publication, Customer, Newspaper, Advertisement, Issue, Placement, Payment, Reminder
US-002 Customer, AdOrder, Advertisement, Payment
US-003 AdOrder, AdOrderItem, Customer, Newspaper, AdShape, PriceRule
US-004 AdOrder, AdOrderItem, Publication, AuditLog
US-005 Advertisement, Customer, User, Newspaper
US-006 Newspaper, PageType, AdShape, AllowedAdShape, PriceRule, LayoutTemplate, TemplatePage, TemplateSlot
US-007 Issue, IssuePage, LayoutTemplate, TemplatePage, TemplateSlot, Placement, Publication, Advertisement
US-008 Issue, IssuePage, Placement, Publication, Advertisement, PdfGenerationLog, AuditLog
US-009 User, UserMembership, Customer, AdOrder, AdOrderItem, Advertisement, Newspaper, AdShape
US-010 Payment, Customer, AdOrder, Publication, Newspaper, AuditLog
FR-1 Business
FR-2 User, UserMembership, Business
FR-8 User, UserMembership
FR-10 AuditLog
FR-11 Reminder, Publication
FR-12 PdfGenerationLog, Issue
FR-15 Advertisement, Issue
FR-16 Placement
FR-17 PriceRule, Publication
FR-20 No persistent entity — dashboard is computed from Publication, Customer, Issue, Reminder, Payment
FR-22 Issue, PdfGenerationLog
