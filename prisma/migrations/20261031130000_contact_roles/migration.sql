-- Each contact can be marked for tear sheets and for billing, next to the
-- reminders tick that already existed (the user, 31/10/2026).
ALTER TABLE "CustomerContact" ADD COLUMN "receives_tear_sheets" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerContact" ADD COLUMN "receives_billing" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN "tear_sheets_to_main" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Customer" ADD COLUMN "billing_to_main" BOOLEAN NOT NULL DEFAULT true;

-- Until now tear sheets went to the business's email AND to every contact
-- ticked for reminders. Kept exactly so: nobody stops receiving them because
-- a new column appeared.
UPDATE "CustomerContact" SET "receives_tear_sheets" = true WHERE "receives_reminders" = true;
