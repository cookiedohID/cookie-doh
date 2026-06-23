-- Cookie Doh — Order acceptance + customer comms
-- Run once (idempotent). Adds an "accepted" marker so the owner can confirm a new
-- order; the hourly reminder cron nags about PAID orders that aren't accepted yet.

alter table public.orders add column if not exists accepted_at timestamptz;

-- Hot path for the hourly reminder: PAID orders not yet accepted.
create index if not exists orders_unaccepted_idx
  on public.orders (created_at)
  where payment_status = 'PAID' and accepted_at is null;
