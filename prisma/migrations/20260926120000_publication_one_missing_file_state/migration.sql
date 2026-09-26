-- One state for "sold, no file yet" (the user's decision, 26/09/2026).
--
-- `planned` and `missing_ad` both meant "no artwork", split only by urgency:
-- a publication was to move planned → missing_ad on entering the reminder
-- window (REMINDER_WINDOW_ENTERED). No code ever fired that event, so in
-- practice a publication without a file stayed "מתוכנן" for ever, and
-- "חסרה מודעה" appeared only when someone UNLINKED a file — the opposite of
-- what anyone reading the list would assume. Urgency lives in the reminders
-- screen, which computes it from the date; the status now says one thing:
-- there is no file.

UPDATE "Publication" SET "status" = 'missing_ad' WHERE "status" = 'planned';

ALTER TYPE "PublicationStatus" RENAME TO "PublicationStatus_old";

CREATE TYPE "PublicationStatus" AS ENUM (
  'missing_ad', 'ad_received', 'ready_for_layout', 'placed', 'published', 'canceled'
);

ALTER TABLE "Publication" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Publication"
  ALTER COLUMN "status" TYPE "PublicationStatus"
  USING ("status"::text::"PublicationStatus");
ALTER TABLE "Publication" ALTER COLUMN "status" SET DEFAULT 'missing_ad';

DROP TYPE "PublicationStatus_old";
