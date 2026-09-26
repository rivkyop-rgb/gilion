-- Who gets the reminders for a customer (the user, 27/09/2026): ticked on the
-- customer's card — the business's own phone/email, any contact, or several.
-- Nothing ticked means the business's own details, so both default to false
-- and every existing customer keeps being reminded exactly where it was.
ALTER TABLE "Customer" ADD COLUMN "reminders_to_main" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerContact" ADD COLUMN "receives_reminders" BOOLEAN NOT NULL DEFAULT false;
