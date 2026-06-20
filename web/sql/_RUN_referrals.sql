-- ============================================================
-- Cookie Doh — referral program.
-- Run once in the Supabase SQL editor.
--
--  loyalty_grants : additive free-cookie/drink credits that live OUTSIDE the
--                   buy-10 engine (the referral bonus). The loyalty balance adds
--                   these on top of earned-from-stamps, minus what's redeemed.
--  referrals      : who referred whom. UNIQUE(referred_phone) makes the whole
--                   "qualify + grant" step idempotent against webhook retries —
--                   a friend can only ever be referred once.
-- ============================================================
create table if not exists public.loyalty_grants (
  id uuid primary key default gen_random_uuid(),
  phone text not null,                 -- canonical "+62..."
  cookies int not null default 0,
  drinks int not null default 0,
  reason text,                         -- e.g. 'referral_referrer' | 'referral_friend'
  ref text,                            -- referral id (audit + idempotency)
  order_id uuid,                       -- qualifying order (audit + future clawback)
  created_at timestamptz not null default now()
);
-- older deployments may predate order_id
alter table public.loyalty_grants add column if not exists order_id uuid;
create index if not exists loyalty_grants_phone_idx on public.loyalty_grants (phone);
-- never double-credit the same (reason, referral) pair
create unique index if not exists loyalty_grants_reason_ref_uidx
  on public.loyalty_grants (reason, ref) where ref is not null;
alter table public.loyalty_grants enable row level security;

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_phone text not null,
  referrer_code text,
  referred_phone text not null unique, -- one referral per friend, ever
  order_id uuid,
  status text not null default 'qualified',
  created_at timestamptz not null default now()
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_phone);
alter table public.referrals enable row level security;
