-- ============================================================
-- Cookie Doh — spend-threshold rewards.
-- Run once in the Supabase SQL editor.
--
-- "Spend Rp300k, add this cookie for Rp30k." The admin defines tiers: a spend
-- threshold, a reward (a fixed set of cookies), and the special price. The cart
-- shows the highest tier the customer has unlocked; checkout re-validates that
-- the qualifying (non-reward) subtotal still meets the threshold and the reward
-- matches the tier, so it can't be gamed.
-- ============================================================
create table if not exists public.spend_rewards (
  id uuid primary key default gen_random_uuid(),
  threshold_idr int not null,            -- min qualifying merchandise subtotal
  label text not null,                   -- shown to the customer
  special_price_idr int not null,        -- what they pay for the reward
  items jsonb not null default '[]',     -- [{ id, name, quantity }] cookies in the reward
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.spend_rewards enable row level security;
