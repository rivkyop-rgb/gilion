/**
 * Gives every existing newspaper the three base page types it is missing —
 * שער, פנימי, גב (04/10/2026). Safe to run any number of times: it only ADDS,
 * never renames or deletes, and a type already present under another name
 * ("אחורי", "שער קטלוג") counts. New newspapers get all three on creation;
 * this is for the ones created before that, or whose types were deleted.
 *
 *   npm run db:ensure-page-types
 */
import "dotenv/config";

import { basePrisma } from "../lib/data/db";
import { ensureBasePageTypes } from "../lib/data/newspapers";

async function main() {
  const papers = await basePrisma.newspaper.findMany({ select: { id: true, name: true } });
  for (const paper of papers) {
    const added = await ensureBasePageTypes(paper.id);
    console.log(
      added.length > 0
        ? `${paper.name}: נוספו ${added.join(", ")}`
        : `${paper.name}: יש כבר את שלושתם`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => basePrisma.$disconnect());
