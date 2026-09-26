-- Per-business choice: does an order typed in the office need a separate
-- approval click, or is it approved straight from the draft? Portal requests
-- always wait for approval regardless (lib/domain/order-status.ts).
-- Default false — the user found the second click redundant for office orders.
ALTER TABLE "Business" ADD COLUMN "internal_orders_need_approval" BOOLEAN NOT NULL DEFAULT false;
