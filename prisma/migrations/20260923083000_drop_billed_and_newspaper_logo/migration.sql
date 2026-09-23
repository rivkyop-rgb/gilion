-- Two values that existed in the model and never in the product.
--
-- 1. Publication.status = 'billed'. In FR-4's list and in the state machine
--    from day one, and no code ever fired the BILLED event: stage 08 derives
--    whether a publication is paid for from the sum of the payment rows on its
--    order, and rule 7 of that stage forbids any screen from setting that by
--    hand. A second, hand-set status saying the same thing is the thing that
--    rule exists to prevent. No row can hold the value, so the USING cast
--    below cannot fail — but it is written as a cast rather than a blind swap
--    so that a row someone managed to write would stop this migration instead
--    of being silently rewritten.
--
-- 2. Newspaper.logo_url and fixed_banner_url. Neither was ever written (no
--    field on the newspaper form) or read (the press sheet does not draw
--    them), because neither carries any geometry — drawing one would mean
--    print-html.ts inventing a position. The model already has "an image that
--    always sits HERE on this kind of page": a reserved area, which has both a
--    rectangle and an asset and which each issue snapshots page by page
--    (backlog item 14). US-006 AC-1 is met by that mechanism instead.

ALTER TABLE "Newspaper" DROP COLUMN "logo_url";
ALTER TABLE "Newspaper" DROP COLUMN "fixed_banner_url";

ALTER TYPE "PublicationStatus" RENAME TO "PublicationStatus_old";

CREATE TYPE "PublicationStatus" AS ENUM (
  'planned', 'missing_ad', 'ad_received', 'ready_for_layout',
  'placed', 'published', 'canceled'
);

ALTER TABLE "Publication" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Publication"
  ALTER COLUMN "status" TYPE "PublicationStatus"
  USING ("status"::text::"PublicationStatus");
ALTER TABLE "Publication" ALTER COLUMN "status" SET DEFAULT 'planned';

DROP TYPE "PublicationStatus_old";
