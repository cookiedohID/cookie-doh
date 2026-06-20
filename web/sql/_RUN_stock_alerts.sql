-- ============================================================
-- Cookie Doh — back-in-stock alerts.
-- Run once in the Supabase SQL editor.
--
-- Customers subscribe to a sold-out flavour; when the admin flips it back to
-- available, the availability route WhatsApps everyone subscribed, then clears
-- the rows. UNIQUE(item_id, phone) keeps one subscription per person per flavour.
-- ============================================================
create table if not exists public.stock_subscriptions (
  id uuid primary key default gen_random_uuid(),
  item_id text not null,
  phone text not null,                 -- canonical "+62..."
  created_at timestamptz not null default now(),
  unique (item_id, phone)
);
create index if not exists stock_subscriptions_item_idx on public.stock_subscriptions (item_id);
alter table public.stock_subscriptions enable row level security;
