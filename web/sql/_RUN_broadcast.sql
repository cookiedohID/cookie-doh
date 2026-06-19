-- ============================================================
-- Cookie Doh — broadcast opt-outs (optional but recommended).
-- Run once in the Supabase SQL editor. Phones listed here are excluded from
-- WhatsApp broadcasts. The broadcast tool works without this table, but it
-- won't be able to honour opt-outs until it exists.
-- ============================================================
create table if not exists public.broadcast_optouts (
  phone text primary key,                    -- canonical "+62XXXXXXXXXX"
  created_at timestamptz not null default now()
);
alter table public.broadcast_optouts enable row level security;
