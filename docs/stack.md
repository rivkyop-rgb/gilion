# Stack — Gilion

מחסנית הטכנולוגיות שנבחרה ל־MVP. כל שלב ב־[`plan/`](plan/README.md) מניח את הבחירות האלה.

| שכבה               | בחירה                                                    |
| ------------------ | -------------------------------------------------------- |
| Frontend + Backend | Next.js 16 + React 19 + TypeScript                       |
| UI                 | Tailwind CSS + shadcn/ui                                 |
| Database           | PostgreSQL 18.x                                          |
| ORM                | Prisma ORM 7.x                                           |
| Auth               | Auth.js / NextAuth-style sessions עם RBAC פנימי          |
| File Storage       | MinIO — S3-compatible על ה־VPS                           |
| PDF Generation     | Playwright/Chromium worker                               |
| Jobs / Queue       | BullMQ + Redis — **רק אם** PDF/תזכורות מתחילים להכביד    |
| Deployment         | VPS Ubuntu + Docker Compose + aaPanel/Nginx/SSL          |
| Reverse Proxy      | Nginx דרך aaPanel                                        |
| Logs / Monitoring  | MVP: Docker logs + structured app logs; Sentry אופציונלי |
| Testing            | Playwright E2E + Vitest / Testing Library                |

## הערות

- **BullMQ + Redis אינם ב־MVP כברירת מחדל.** הפקת PDF סינכרונית; התור נכנס רק אם נמדדת בעיית ביצועים בפועל ([`plan/07-pdf.md`](plan/07-pdf.md)).
- **MinIO** מוגדר כ־bucket פרטי בלבד. אין URL ציבורי לקובץ — הגישה דרך presigned URL קצר-מועד (FR-15, [`plan/conventions.md`](plan/conventions.md) §5).
- **Postgres RLS** מחוץ ל־MVP, אבל הסכימה נבנית כך שאפשר להוסיף אותו בלי שינוי מבנה ([`plan/conventions.md`](plan/conventions.md) §2).
