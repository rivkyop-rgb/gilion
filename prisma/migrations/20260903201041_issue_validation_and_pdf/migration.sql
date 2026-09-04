-- CreateEnum
CREATE TYPE "PdfType" AS ENUM ('draft', 'final');

-- CreateEnum
CREATE TYPE "PdfGenerationStatus" AS ENUM ('generated', 'failed');

-- CreateTable
CREATE TABLE "PdfGenerationLog" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "generated_by_user_id" TEXT NOT NULL,
    "pdf_type" "PdfType" NOT NULL,
    "status" "PdfGenerationStatus" NOT NULL,
    "file_url" TEXT,
    "error_message" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfGenerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PdfGenerationLog_issue_id_generated_at_idx" ON "PdfGenerationLog"("issue_id", "generated_at" DESC);

-- AddForeignKey
ALTER TABLE "PdfGenerationLog" ADD CONSTRAINT "PdfGenerationLog_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfGenerationLog" ADD CONSTRAINT "PdfGenerationLog_generated_by_user_id_fkey" FOREIGN KEY ("generated_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
