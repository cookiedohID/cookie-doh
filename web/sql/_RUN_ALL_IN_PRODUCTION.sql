-- ============================================================
-- Cookie Doh — RUN ALL of this in the Supabase SQL editor, once.
-- Safe to re-run (every statement is idempotent).
-- ============================================================

-- ===== customers.sql =====
-- Cookie Doh — Customer database
-- Run once in the Supabase SQL editor.
--
-- One row per customer, keyed by canonical phone (+62...). Orders are matched
-- back to a customer by phone, so the orders table needs no change.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,        -- canonical "+62XXXXXXXXXX"
  name text,
  email text,
  orders_count integer not null default 0,
  last_order_at timestamptz,

  -- Membership / loyalty
  member_code text unique,           -- short code encoded in the membership QR
  auth_user_id uuid,                 -- links to Supabase auth user once they log in
  phone_verified boolean not null default false,  -- verified via WhatsApp OTP
  cookies_redeemed integer not null default 0,
  drinks_redeemed integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_name_idx on public.customers (lower(name));

-- Lock the table down: customer PII (name, email, phone, loyalty) is only read/
-- written by our service-role API routes. RLS on + NO anon/authenticated policies
-- means the public anon key shipped to the browser cannot read the customer list.
alter table public.customers enable row level security;

-- ===== locations.sql =====
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

-- ===== phone_otps.sql =====
-- Cookie Doh — WhatsApp OTP store (phone verification via Fonnte)
-- Run once in the Supabase SQL editor.

create table if not exists public.phone_otps (
  phone text primary key,            -- canonical "+62..."
  code_hash text not null,           -- sha256 of the 6-digit code
  expires_at timestamptz not null,
  verified boolean not null default false,
  attempts integer not null default 0,
  last_sent_at timestamptz not null default now()
);

-- Bind a verification to the signed-in user who completed it, so a once-verified
-- phone can't later be claimed by a different account.
alter table public.phone_otps add column if not exists auth_user_id uuid;

-- Lock the table down: only the service role (used by our API routes) may touch
-- it. With RLS on and NO anon/authenticated policies, the public anon key can't
-- read code hashes or flip `verified`.
alter table public.phone_otps enable row level security;

-- ===== loyalty_redemptions.sql =====
-- Cookie Doh — Atomic loyalty reward reservations
-- Run once in the Supabase SQL editor.
--
-- Fixes the redemption double-spend race: reward availability is derived from
-- PAID orders, so two near-simultaneous checkouts for the same member could each
-- see the same balance and both settle, redeeming more free items than earned.
--
-- This table + RPC make "check availability and reserve" a single atomic step,
-- serialized per phone with an advisory lock. Earning stays derived from order
-- history; only REDEMPTION is gated here.
--
-- Lifecycle of a row:
--   reserved  -> created at cafe checkout, before the order is paid
--   consumed  -> the order was paid (webhook); the free line now lives on a PAID
--                order and is counted by the derived balance, so consumed rows are
--                NOT subtracted again (avoids double counting)
--   released  -> the order failed/expired; the reward is freed

create table if not exists public.loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  phone text not null,                 -- canonical "+62..."
  order_id uuid,                       -- linked once known
  midtrans_order_id text,              -- used to settle from the webhook
  cookies integer not null default 0,
  drinks integer not null default 0,
  status text not null default 'reserved',  -- reserved | consumed | released
  created_at timestamptz not null default now()
);

create index if not exists loyalty_redemptions_phone_idx
  on public.loyalty_redemptions (phone, status);
create index if not exists loyalty_redemptions_midtrans_idx
  on public.loyalty_redemptions (midtrans_order_id);

-- Service-role only (same as customers / phone_otps).
alter table public.loyalty_redemptions enable row level security;

-- Atomic reserve. The caller passes the member's CURRENTLY DERIVED available
-- balance (from paid-order history); this function subtracts reward units that
-- are already reserved-but-not-yet-paid and only inserts if enough remain.
-- Abandoned reservations (no webhook ever settles them) stop counting after
-- 30 minutes so a closed payment popup doesn't lock a reward forever.
create or replace function public.reserve_rewards(
  p_phone text,
  p_avail_cookies integer,
  p_avail_drinks integer,
  p_want_cookies integer,
  p_want_drinks integer,
  p_midtrans_order_id text
) returns boolean
language plpgsql
as $$
declare
  reserved_cookies integer;
  reserved_drinks integer;
begin
  -- Serialize concurrent checkouts for the same member.
  perform pg_advisory_xact_lock(hashtext(p_phone));

  select coalesce(sum(cookies), 0), coalesce(sum(drinks), 0)
    into reserved_cookies, reserved_drinks
    from public.loyalty_redemptions
    where phone = p_phone
      and status = 'reserved'
      and created_at > now() - interval '30 minutes';

  if (p_avail_cookies - reserved_cookies) < p_want_cookies
     or (p_avail_drinks - reserved_drinks) < p_want_drinks then
    return false;
  end if;

  insert into public.loyalty_redemptions
    (phone, cookies, drinks, midtrans_order_id, status)
    values (p_phone, p_want_cookies, p_want_drinks, p_midtrans_order_id, 'reserved');

  return true;
end;
$$;

-- ===== print_queue.sql =====
-- Cookie Doh — Cafe print queue
-- Run once in the Supabase SQL editor.
--
-- The local print agent (print-agent/) polls for PAID cafe orders that haven't
-- been printed yet, prints the 3 docs, then marks them printed. One timestamp on
-- the order is all the bookkeeping we need.

alter table public.orders add column if not exists printed_at timestamptz;

-- Fast lookup of the unprinted paid-cafe queue.
create index if not exists orders_print_queue_idx
  on public.orders (paid_at)
  where printed_at is null;

-- ===== _RUN_referrals.sql =====
-- Cookie Doh — referral program (loyalty_grants + referrals).
create table if not exists public.loyalty_grants (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  cookies int not null default 0,
  drinks int not null default 0,
  reason text,
  ref text,
  order_id uuid,
  created_at timestamptz not null default now()
);
alter table public.loyalty_grants add column if not exists order_id uuid;
create index if not exists loyalty_grants_phone_idx on public.loyalty_grants (phone);
create unique index if not exists loyalty_grants_reason_ref_uidx
  on public.loyalty_grants (reason, ref) where ref is not null;
alter table public.loyalty_grants enable row level security;

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_phone text not null,
  referrer_code text,
  referred_phone text not null unique,
  order_id uuid,
  status text not null default 'qualified',
  created_at timestamptz not null default now()
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_phone);
alter table public.referrals enable row level security;
