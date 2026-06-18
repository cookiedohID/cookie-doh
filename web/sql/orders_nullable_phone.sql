-- Cookie Doh — allow phone-less orders (cafe walk-ins)
-- Run once in the Supabase SQL editor.
--
-- The cafe POS lets walk-in customers check out without a member phone, but the
-- orders table had customer_phone NOT NULL, which rejected those orders with:
--   null value in column "customer_phone" ... violates not-null constraint
-- A walk-in legitimately has no phone, so the column should be nullable.

alter table public.orders alter column customer_phone drop not null;
