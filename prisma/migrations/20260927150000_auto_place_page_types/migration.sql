-- Where auto-placement may place, and what it adds when it runs out of room,
-- set per page type in the newspaper's settings (the user, 27/09/2026).
-- Defaults keep today's behaviour: every type is eligible, and the added pages
-- are the inner type found by name.
ALTER TABLE "PageType" ADD COLUMN "auto_place" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PageType" ADD COLUMN "auto_grow" BOOLEAN NOT NULL DEFAULT false;
