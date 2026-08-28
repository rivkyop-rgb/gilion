-- The platform owner: may enter any business without a membership, and is the
-- only one who may create businesses at all.
--
-- A column on User rather than a sixth MembershipRole, because the five roles
-- answer "what may this person do inside this business" and this one answers
-- "which businesses exist for this person" — a question no membership row can
-- carry, since it would need a business of its own to belong to.
--
-- Defaults to false, so every existing user stays exactly as scoped as before.
ALTER TABLE "User" ADD COLUMN "is_super_admin" BOOLEAN NOT NULL DEFAULT false;
