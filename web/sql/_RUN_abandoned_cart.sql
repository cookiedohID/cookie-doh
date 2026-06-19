-- ============================================================
-- Cookie Doh — abandoned-cart nudge support.
-- Run once in the Supabase SQL editor.
--
-- Two columns on orders:
--   nudged_at   — when we sent the "finish your order" WhatsApp (also the
--                 atomic claim: the cron only nudges rows where this is NULL,
--                 so overlapping runs can never double-send).
--   nudge_token — an unguessable secret put in the /pay link, so knowing the
--                 order id alone isn't enough to fetch the payment token.
-- ============================================================
alter table public.orders add column if not exists nudged_at timestamptz;
alter table public.orders add column if not exists nudge_token text;

-- Helps the hourly scan skip already-nudged carts quickly.
create index if not exists orders_nudge_idx
  on public.orders (payment_status, created_at)
  where nudged_at is null;
