-- CreateTable
CREATE TABLE "PageReservation" (
    "id" TEXT NOT NULL,
    "newspaper_id" TEXT NOT NULL,
    "page_type_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "col" INTEGER NOT NULL,
    "row" INTEGER NOT NULL,
    "cols" INTEGER NOT NULL,
    "rows" INTEGER NOT NULL,
    "asset_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssuePageReservation" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "issue_page_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "col" INTEGER NOT NULL,
    "row" INTEGER NOT NULL,
    "cols" INTEGER NOT NULL,
    "rows" INTEGER NOT NULL,
    "asset_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssuePageReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageReservation_newspaper_id_idx" ON "PageReservation"("newspaper_id");

-- CreateIndex
CREATE UNIQUE INDEX "PageReservation_page_type_id_name_key" ON "PageReservation"("page_type_id", "name");

-- CreateIndex
CREATE INDEX "IssuePageReservation_issue_id_idx" ON "IssuePageReservation"("issue_id");

-- AddForeignKey
ALTER TABLE "PageReservation" ADD CONSTRAINT "PageReservation_page_type_id_newspaper_id_fkey" FOREIGN KEY ("page_type_id", "newspaper_id") REFERENCES "PageType"("id", "newspaper_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuePageReservation" ADD CONSTRAINT "IssuePageReservation_issue_page_id_issue_id_fkey" FOREIGN KEY ("issue_page_id", "issue_id") REFERENCES "IssuePage"("id", "issue_id") ON DELETE CASCADE ON UPDATE CASCADE;
