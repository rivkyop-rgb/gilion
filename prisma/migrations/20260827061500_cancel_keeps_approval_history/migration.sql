-- An approved order could not be cancelled at all: the check was written as an
-- EQUIVALENCE, so `approved_at` had to be NULL for every status outside
-- (approved, completed). Cancelling an approved order leaves the timestamp in
-- place and flips the status to `canceled`, which violated it — the state
-- machine allows approved -> canceled, but the database refused the resulting
-- row and the action failed with a 500.
--
-- The comment on the original constraint states the intent as an IMPLICATION:
-- "a row claiming to be approved without a timestamp is a bug". That is what
-- is restored here. Nulling `approved_at` on cancel would have satisfied the
-- old constraint, but it would erase the fact that the order WAS approved on a
-- given date — a cancelled order that has already produced publications must
-- keep that history, not pretend the approval never happened.
ALTER TABLE "AdOrder"
  DROP CONSTRAINT "AdOrder_approved_at_present_when_approved";

ALTER TABLE "AdOrder"
  ADD CONSTRAINT "AdOrder_approved_at_present_when_approved"
  CHECK (status NOT IN ('approved', 'completed') OR approved_at IS NOT NULL);

-- `completed_at` is deliberately left as an equivalence: `completed` is a
-- terminal state in the machine (no event leaves it), so no transition can
-- strand a timestamp there. If a later stage ever adds an exit from
-- `completed`, this constraint needs the same treatment.
