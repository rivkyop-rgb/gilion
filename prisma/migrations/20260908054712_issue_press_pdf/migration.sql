-- AlterEnum
ALTER TYPE "PdfType" ADD VALUE 'press';

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "press_pdf_url" TEXT;
