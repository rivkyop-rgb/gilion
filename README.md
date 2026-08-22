# Gilion

מערכת לניהול פרסום בעיתון — לקוחות, הזמנות, מודעות, שיבוץ בגיליון, הפקת PDF, גבייה ופורטל לקוח.

האפיון הוא מקור האמת: [`docs/prd.md`](docs/prd.md) · [`docs/erd.md`](docs/erd.md) · [`docs/stack.md`](docs/stack.md).
סדר הבנייה: [`docs/plan/README.md`](docs/plan/README.md). **לפני כתיבת קוד — לקרוא [`docs/plan/conventions.md`](docs/plan/conventions.md).**

---

## הרצה מקומית

```bash
npm install
npm run db:up          # Postgres + MinIO
npx prisma migrate deploy
npm run dev            # http://localhost:3100
```

### פורטים

הפורטים המקובלים (3000, 5432, 9000/9001) תפוסים ע"י פרויקט אחר על אותה מכונה, ולכן Gilion משתמש ב:

| שירות         | פורט   |
| ------------- | ------ |
| אפליקציה      | `3100` |
| Postgres      | `5433` |
| MinIO API     | `9100` |
| MinIO Console | `9101` |

### Docker

המשתמש `runner` **כבר חבר בקבוצת `docker`**, אבל סשן שנפתח לפני שהחברות נוספה עדיין לא רואה אותה.
לכן ב־session ישן `npm run db:up` נכשל ב־`permission denied`.

- **תיקון:** לצאת ולהתחבר מחדש (או `newgrp docker` בטרמינל הנוכחי). אחרי זה `npm run db:up` עובד רגיל.
- **עקיפה זמנית:** `sudo docker compose -f docker-compose.dev.yml up -d`

לבדיקה שהחברות נכנסה לתוקף: `docker ps` בלי `sudo`.

---

## פקודות

| פקודה                       | מה היא עושה                  |
| --------------------------- | ---------------------------- |
| `npm run dev`               | שרת פיתוח                    |
| `npm run build`             | בילד production              |
| `npm run typecheck`         | `tsc --noEmit`               |
| `npm run lint`              | ESLint, כולל כללי RTL ושכבות |
| `npm run format`            | Prettier                     |
| `npm test`                  | Vitest                       |
| `npm run e2e`               | Playwright                   |
| `npm run db:up` / `db:down` | Postgres + MinIO             |
| `npm run db:migrate`        | מיגרציה חדשה                 |

---

## מה נאכף אוטומטית

- **RTL** — `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`/`text-left`/`text-right` חסומים ב־ESLint. רק logical properties. ([conventions.md §1](docs/plan/conventions.md))
- **שכבות** — `@prisma/client` מותר לייבוא רק מ־`lib/data/` ומ־`lib/db.ts`. ([conventions.md §2](docs/plan/conventions.md))
- **TypeScript** — `strict` + `noUncheckedIndexedAccess`.

---

## מבנה

```
app/          מסלולים — (internal) / (portal) / (auth) / api/files / print
lib/domain/   לוגיקה עסקית טהורה. ללא Prisma, ללא React.
lib/data/     Prisma בלבד — השכבה היחידה שמייבאת @prisma/client
lib/auth/     סשן, RBAC, getTenantContext
lib/storage/  MinIO
components/   ui/ (shadcn + התאמות RTL) + רכיבים לפי תחום
prisma/       schema + migrations
e2e/          Playwright
docs/         אפיון, מודל נתונים, עיצוב, תוכנית בנייה
```

---

## מיתוג

`public/brand/` מכיל את ברירות המחדל: `mark.svg` (סיידבר, כותרות), `favicon.svg`, `wordmark.svg`, `logo-full.png`.

**אלה ברירות מחדל בלבד.** החלפת לוגו, favicon או צבעי מותג נעשית מפאנל הניהול ([שלב 11](docs/plan/11-admin-panel.md)) — לא בקוד. אף רכיב לא מקשיח נתיב ללוגו או ערך צבע.
