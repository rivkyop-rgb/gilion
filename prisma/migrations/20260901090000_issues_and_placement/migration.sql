-- Stage 06 — issues and the placement board (US-007, FR-6, FR-14, FR-16).
--
-- Three tables and, at the bottom, the two constraints that make FR-16 a
-- property of the database rather than a promise made by the UI. A UI cannot
-- defend against two tabs; an EXCLUDE constraint can.
--
-- btree_gist is what lets `=` on a text id sit in the same GiST index as the
-- two range overlap operators. Installing it needs superuser on the database
-- (conventions.md §4).


-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('draft', 'in_layout', 'ready_for_print', 'closed');

-- CreateEnum
CREATE TYPE "PlacementState" AS ENUM ('placed', 'removed', 'published');

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "newspaper_id" TEXT NOT NULL,
    "issue_date" DATE NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'draft',
    "final_pdf_url" TEXT,
    "closed_at" TIMESTAMP(3),
    "page_size" TEXT NOT NULL,
    "custom_width_mm" DECIMAL(7,2),
    "custom_height_mm" DECIMAL(7,2),
    "margin" DECIMAL(6,2) NOT NULL,
    "columns" INTEGER NOT NULL,
    "row_height_mm" DECIMAL(6,2) NOT NULL,
    "gutter_mm" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssuePage" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "page_type_id" TEXT NOT NULL,
    "page_number" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssuePage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "issue_page_id" TEXT NOT NULL,
    "publication_id" TEXT NOT NULL,
    "advertisement_id" TEXT NOT NULL,
    "ad_shape_id" TEXT NOT NULL,
    "col" INTEGER NOT NULL,
    "row" INTEGER NOT NULL,
    "cols" INTEGER NOT NULL,
    "rows" INTEGER NOT NULL,
    "status" "PlacementState" NOT NULL DEFAULT 'placed',
    "duplicate_override_approved" BOOLEAN NOT NULL DEFAULT false,
    "duplicate_override_approved_by_user_id" TEXT,
    "duplicate_override_approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Issue_business_id_status_issue_date_idx" ON "Issue"("business_id", "status", "issue_date");

-- CreateIndex
CREATE UNIQUE INDEX "Issue_business_id_newspaper_id_issue_date_key" ON "Issue"("business_id", "newspaper_id", "issue_date");

-- CreateIndex
CREATE INDEX "IssuePage_issue_id_idx" ON "IssuePage"("issue_id");

-- CreateIndex
CREATE UNIQUE INDEX "IssuePage_issue_id_page_number_key" ON "IssuePage"("issue_id", "page_number");

-- CreateIndex
CREATE UNIQUE INDEX "IssuePage_id_issue_id_key" ON "IssuePage"("id", "issue_id");

-- CreateIndex
CREATE INDEX "Placement_issue_page_id_status_idx" ON "Placement"("issue_page_id", "status");

-- CreateIndex
CREATE INDEX "Placement_publication_id_idx" ON "Placement"("publication_id");

-- CreateIndex
CREATE INDEX "Placement_issue_id_status_idx" ON "Placement"("issue_id", "status");

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_newspaper_id_fkey" FOREIGN KEY ("newspaper_id") REFERENCES "Newspaper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuePage" ADD CONSTRAINT "IssuePage_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuePage" ADD CONSTRAINT "IssuePage_page_type_id_fkey" FOREIGN KEY ("page_type_id") REFERENCES "PageType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_issue_page_id_issue_id_fkey" FOREIGN KEY ("issue_page_id", "issue_id") REFERENCES "IssuePage"("id", "issue_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "Publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_advertisement_id_fkey" FOREIGN KEY ("advertisement_id") REFERENCES "Advertisement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_ad_shape_id_fkey" FOREIGN KEY ("ad_shape_id") REFERENCES "AdShape"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_duplicate_override_approved_by_user_id_fkey" FOREIGN KEY ("duplicate_override_approved_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- FR-16 — the two rules the UI is not allowed to be the only guard for
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- No two ads may share a cell on the same page.
--
-- Half-open ranges on both axes: `[col, col + cols)`. That is what makes two
-- ads that merely TOUCH — cols 0-2 next to cols 3-5 — a normal layout instead
-- of a conflict, and it is the same rule `overlaps()` implements in
-- lib/domain/slot-geometry.ts, so the database and the domain cannot disagree
-- about an edge case.
--
-- Filtered on 'placed': a removed placement frees its space without losing the
-- history of having been there.
ALTER TABLE "Placement" ADD CONSTRAINT placement_no_overlap
  EXCLUDE USING gist (
    "issue_page_id"                    WITH =,
    int4range("col", "col" + "cols")   WITH &&,
    int4range("row", "row" + "rows")   WITH &&
  ) WHERE (status = 'placed');

-- One publication is placed once per issue, unless an admin approved the
-- override. Violating this raises Prisma's P2002; violating the EXCLUDE above
-- raises Postgres' 23P01, and Prisma does NOT map the second onto the first —
-- they are two separate paths in lib/data/placements.ts.
CREATE UNIQUE INDEX placement_publication_unique
  ON "Placement" ("publication_id", "issue_id")
  WHERE status = 'placed' AND duplicate_override_approved = false;
