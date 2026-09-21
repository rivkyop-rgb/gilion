-- A default nobody is meant to use.
--
-- The app always supplies a slug: there is no @default in the schema, so
-- TypeScript refuses a `create` without one (CLAUDE.md — "a column every
-- create must fill: do not give it a default"). This exists for a different
-- reason: while stage 09 was being built, an OLDER branch was still pointed at
-- the demo database and creates a Business without knowing this column. A
-- unique-ish default turns a NOT NULL violation into a row the admin can
-- rename, and the unique index still refuses a real collision.
ALTER TABLE "Business" ALTER COLUMN "slug" SET DEFAULT substr(md5(random()::text), 1, 12);
