-- Cookie Doh — Multi-location inventory
-- Run once in the Supabase SQL editor.
--
-- Locations themselves live in code (web/lib/locations.ts): kemang, tbs-rcv,
-- tbs-ktr, tbs-xmas. This table just holds stock per (location, item).
--   item_id  = cookie id or smoothie id
--   stock    = NULL -> untracked (unlimited); <= 0 -> sold out
--   sold_out = manual override

create table if not exists public.location_stock (
  location_id text not null,
  item_id text not null,
  stock integer,
  sold_out boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (location_id, item_id)
);

create index if not exists location_stock_item_idx on public.location_stock (item_id);
