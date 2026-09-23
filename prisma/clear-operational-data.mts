/**
 * Empties the system of everything a person entered, and keeps everything a
 * person configured.
 *
 * Written 23/09/2026, when the demo database was eight customers, nineteen
 * orders and twenty-five publications of seed and test residue, and the point
 * became to work in the product rather than to look at it.
 *
 * GOES:    customers (and their portal logins), orders and their lines,
 *          publications, advertisements and the files behind them, issues,
 *          pages, reserved-area snapshots, placements, PDF logs and the final
 *          PDFs in storage, payments, reminders, the audit trail — and the
 *          per-business order counter, so numbering opens at ORD-0001 again
 *          rather than continuing from whatever the residue reached.
 *
 * STAYS:   businesses, staff users and their memberships, newspapers with
 *          their grid, page types, shapes, allowed shapes, reserved areas and
 *          price list, permission overrides, and the brand assets and settings
 *          of the admin panel.
 *
 * The line between the two is "did somebody set this up, or did somebody do
 * this": a newspaper's grid is a decision that took an afternoon, and an order
 * is a Tuesday.
 *
 * Deletion order follows the foreign keys, which are `Restrict` on every path
 * that matters — a customer cannot go before the publications, advertisements
 * and payments that name them. Anything out of order fails loudly rather than
 * half-deleting: the whole thing runs in one transaction.
 *
 *   npx tsx prisma/clear-operational-data.mts            # asks for --yes
 *   npx tsx prisma/clear-operational-data.mts --yes
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Objects under these folders belong to the data; `brand/` belongs to setup. */
const FOLDERS = ["ads", "issues"] as const;

async function clearStorage(businessIds: string[]) {
  const { Client } = await import("minio");
  const client = new Client({
    endPoint: process.env.MINIO_ENDPOINT!,
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY!,
    secretKey: process.env.MINIO_SECRET_KEY!,
  });
  const bucket = process.env.MINIO_BUCKET!;
  if (!(await client.bucketExists(bucket))) return 0;

  let removed = 0;
  for (const businessId of businessIds) {
    for (const folder of FOLDERS) {
      const keys: string[] = [];
      const stream = client.listObjectsV2(bucket, `${businessId}/${folder}/`, true);
      await new Promise<void>((resolve, reject) => {
        stream.on("data", (o) => o.name && keys.push(o.name));
        stream.on("end", () => resolve());
        stream.on("error", reject);
      });
      if (keys.length) {
        await client.removeObjects(bucket, keys);
        removed += keys.length;
      }
    }
  }
  return removed;
}

async function main() {
  if (!process.argv.includes("--yes")) {
    console.error("זו מחיקה בלתי הפיכה. להריץ עם --yes אחרי שקראת מה נמחק (ראש הקובץ).");
    process.exit(1);
  }

  const businesses = await prisma.business.findMany({ select: { id: true, name: true } });
  console.log(`עסקים: ${businesses.map((b) => b.name).join(" · ")}`);

  const counts = await prisma.$transaction(async (tx) => {
    // Portal logins are Users, and they only exist because a customer does.
    // Collected before the memberships go, since that is the only link.
    const portalMemberships = await tx.userMembership.findMany({
      where: { role: "customer" },
      select: { user_id: true },
    });
    const portalUserIds = portalMemberships.map((m) => m.user_id);

    const placements = await tx.placement.deleteMany({});
    const pdfLogs = await tx.pdfGenerationLog.deleteMany({});
    // Reservations and pages cascade from the issue, but are deleted first so
    // a future change to those relations cannot leave them behind silently.
    await tx.issuePageReservation.deleteMany({});
    await tx.issuePage.deleteMany({});
    const issues = await tx.issue.deleteMany({});
    const reminders = await tx.reminder.deleteMany({});
    const publications = await tx.publication.deleteMany({});
    // Payments before orders AND before customers: Restrict on both.
    const payments = await tx.payment.deleteMany({});
    await tx.adOrderItem.deleteMany({});
    const orders = await tx.adOrder.deleteMany({});
    const ads = await tx.advertisement.deleteMany({});

    // The trail describes rows that no longer exist. Kept it would be a log of
    // ghosts; FR-10 is about actions on live records.
    //
    // BEFORE the users, not after: AuditLog.user_id is Restrict, so a portal
    // login that ever signed in cannot be deleted while its rows stand. The
    // first run of this script found that out — and found it out safely,
    // because the whole thing is one transaction and nothing was deleted.
    const audit = await tx.auditLog.deleteMany({});

    await tx.userMembership.deleteMany({ where: { role: "customer" } });
    const portalUsers = await tx.user.deleteMany({
      where: { id: { in: portalUserIds }, user_type: "customer" },
    });
    const customers = await tx.customer.deleteMany({});

    // Without this the next order is ORD-0236 and the first demo opens on a
    // number nobody recognises (CLAUDE.md).
    await tx.business.updateMany({ data: { last_order_number: 0 } });

    return {
      לקוחות: customers.count,
      "משתמשי פורטל": portalUsers.count,
      הזמנות: orders.count,
      פרסומים: publications.count,
      מודעות: ads.count,
      גיליונות: issues.count,
      שיבוצים: placements.count,
      תשלומים: payments.count,
      תזכורות: reminders.count,
      "לוגי הפקה": pdfLogs.count,
      "שורות יומן": audit.count,
    };
  });

  const files = await clearStorage(businesses.map((b) => b.id));

  console.log(JSON.stringify(counts, null, 2));
  console.log(`קבצים שנמחקו מהאחסון: ${files}`);
  console.log("נשארו: עסקים, משתמשי צוות, עיתונים, גריד, סוגי עמודים, צורות, מחירון, מיתוג.");
}

await main();
await prisma.$disconnect();
