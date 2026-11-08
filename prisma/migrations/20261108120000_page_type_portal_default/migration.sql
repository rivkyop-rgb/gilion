-- The page type a portal request is filed under by default (08/11/2026).
ALTER TABLE "PageType" ADD COLUMN "portal_default" BOOLEAN NOT NULL DEFAULT false;
