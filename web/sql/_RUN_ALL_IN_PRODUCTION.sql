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


-- ============================================================
-- Subscriptions (prepaid cookie-box plans) — see sql/subscriptions.sql
-- ============================================================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_phone text not null,                       -- canonical "+62..." — identity
  auth_user_id uuid,                               -- optional Supabase auth link (set once)
  name text,
  email text,
  box_size smallint not null check (box_size in (3, 6)),
  mode text not null check (mode in ('fixed', 'curated')),
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  fixed_flavours jsonb not null default '[]'::jsonb,   -- fixed mode: [{id,name,quantity}] sums to box_size
  anchor_dom smallint,                              -- day-of-month anchor for monthly (clamped)
  fulfilment text not null default 'delivery' check (fulfilment in ('delivery', 'pickup')),
  ship_snapshot jsonb not null default '{}'::jsonb,    -- address/origin/courier OR pickup point (read live at materialize)
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'active', 'paused', 'completed', 'cancelled')),
  next_delivery_on date,                            -- next box date (null until activated)
  skip_next boolean not null default false,
  delivery_seq integer not null default 0,          -- increments per materialized box (drives curated + bonus rotation)
  refund_idr integer,                               -- server-computed owed refund on cancel
  refund_status text check (refund_status in ('pending', 'paid')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  renewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_owner_phone_idx on public.subscriptions (owner_phone);
create index if not exists subscriptions_auth_user_idx on public.subscriptions (auth_user_id) where auth_user_id is not null;
create index if not exists subscriptions_due_idx on public.subscriptions (next_delivery_on) where status = 'active';

-- ── 2) subscription_plans — append-only, one row per prepaid QRIS top-up ──────────────
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  boxes_total smallint not null check (boxes_total > 0),
  boxes_used smallint not null default 0,
  amount_idr integer not null,                      -- server-computed N × BOX_PRICES[size]
  midtrans_order_id text not null unique,           -- "CD-SUB-YYYYMMDD-XXXXXX"
  payment_status text not null default 'PENDING'
    check (payment_status in ('PENDING', 'PAID', 'UNPAID', 'FAILED')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists subscription_plans_sub_idx on public.subscription_plans (subscription_id);
-- Current funding plan: PAID with capacity left.
create index if not exists subscription_plans_active_idx on public.subscription_plans (subscription_id)
  where payment_status = 'PAID' and boxes_used < boxes_total;

-- ── 3) subscription_deliveries — one row per box occurrence ──────────────────────────
create table if not exists public.subscription_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id),   -- funding plan (null until materialized)
  seq integer not null,                             -- 1-based box number within the subscription
  scheduled_for date not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'skipped', 'made', 'delivered', 'failed')),
  resolved_items jsonb not null default '[]'::jsonb,   -- frozen lines incl. bonus (orders.items_json shape)
  order_id uuid,                                    -- the materialized public.orders row
  order_no text,
  made_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  -- One box per (subscription, seq) — blocks double-scheduling.
  constraint subscription_deliveries_sub_seq_uniq unique (subscription_id, seq)
);

create index if not exists subscription_deliveries_due_idx on public.subscription_deliveries (scheduled_for)
  where status = 'scheduled';
create index if not exists subscription_deliveries_order_idx on public.subscription_deliveries (order_id)
  where order_id is not null;
-- Reconciliation: made boxes that never got an order row.
create index if not exists subscription_deliveries_orphan_idx on public.subscription_deliveries (made_at)
  where status = 'made' and order_id is null;

-- ── Lock down: these tables hold PII (phone, email, address). RLS on + NO anon policies
--    means the browser anon key can't read them; all access goes through service-role API.
alter table public.subscriptions enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.subscription_deliveries enable row level security;

alter table public.subscription_deliveries add column if not exists last_reminder_offset smallint;


-- Order acceptance + comms (see sql/order_comms.sql)
alter table public.orders add column if not exists accepted_at timestamptz;
create index if not exists orders_unaccepted_idx on public.orders (created_at) where payment_status = 'PAID' and accepted_at is null;

alter table public.subscriptions add column if not exists pending_rewards jsonb not null default '[]'::jsonb;

-- Deliver-to-someone-else recipient (see sql/order_recipient.sql)
alter table public.orders add column if not exists recipient_name text;
alter table public.orders add column if not exists recipient_phone text;

-- WhatsApp AI assistant state (see sql/whatsapp_bot.sql)
create table if not exists public.wa_messages (id uuid primary key default gen_random_uuid(), phone text not null, role text not null check (role in ('user','assistant')), text text not null, created_at timestamptz not null default now());
create index if not exists wa_messages_phone_idx on public.wa_messages (phone, created_at desc);
create table if not exists public.wa_state (phone text primary key, auto_paused_until timestamptz, last_inbound_id text, updated_at timestamptz not null default now());
alter table public.wa_messages enable row level security;
alter table public.wa_state enable row level security;

-- VIP tiers (annual to reach, monthly to keep — see sql/vip_tiers.sql)
create table if not exists public.vip_tiers (id uuid primary key default gen_random_uuid(), name text not null, reach_annual_idr int not null, maintain_monthly_idr int not null default 0, loyalty_per_free int not null default 10, free_delivery boolean not null default false, free_cookie_per_order boolean not null default false, active boolean not null default false, created_at timestamptz not null default now());
create index if not exists vip_tiers_reach_idx on public.vip_tiers (reach_annual_idr asc);
alter table public.vip_tiers enable row level security;


-- Owner-tunable settings (admin UI writes via service role; RLS keeps anon out).
-- Already applied to prod 2026-07-05 (Fable session) — kept here for reference.
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
