-- Three settings the admin panel offered, validated and stored, and that no
-- screen ever read: every date in the product is formatted he-IL in
-- Asia/Jerusalem and every amount in ILS, per conventions.md §1, by
-- module-level Intl formatters that take no argument.
--
-- Dropped rather than wired, because wiring them is not a wiring job: those
-- formatters are imported by client components, so a per-business format needs
-- a request-level context and a pass over every screen showing money or a
-- date. That is a decision for whoever decides the product sells outside
-- Israel; until then a control that saves and changes nothing is worse than no
-- control, because the next person to look reads the screen and believes it.
ALTER TABLE "BusinessSettings" DROP COLUMN "timezone";
ALTER TABLE "BusinessSettings" DROP COLUMN "date_format";
ALTER TABLE "BusinessSettings" DROP COLUMN "currency";
