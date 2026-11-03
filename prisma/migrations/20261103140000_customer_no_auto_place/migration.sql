-- A customer whose ads are always placed by hand (03/11/2026).
ALTER TABLE "Customer" ADD COLUMN "no_auto_place" BOOLEAN NOT NULL DEFAULT false;
