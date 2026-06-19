-- ============================================================
-- Cookie Doh — Reporting + Saved Addresses migration.
-- Run ONCE in the Supabase SQL editor. Every statement is idempotent
-- and additive (no drops, no column type changes) so the LIVE
-- checkout + Midtrans webhook keep working unchanged.
-- ============================================================

-- ---------- Saved addresses (multiple per member) ----------
-- Keyed by canonical phone (+62...) to match how orders/customers are
-- joined everywhere in this codebase. Service-role only (RLS on, no
-- anon/authenticated policies) — same lockdown as customers/phone_otps.
create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  phone text not null,                       -- canonical "+62XXXXXXXXXX"
  label text,                                -- e.g. 'Home', 'Office'
  recipient_name text,
  recipient_phone text,
  address text not null,
  building_name text,
  postal text,
  city text,
  destination_area_id text,                  -- Biteship area id
  destination_area_label text,
  lat double precision,
  lng double precision,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_addresses_phone_idx
  on public.customer_addresses (phone);

-- At most one default address per phone.
create unique index if not exists customer_addresses_one_default_idx
  on public.customer_addresses (phone)
  where is_default;

alter table public.customer_addresses enable row level security;

-- ---------- Inventory transaction history (audit log) ----------
-- location_stock only stores the CURRENT value; this logs every decrement
-- (before/after) so the inventory-transactions report has history.
-- Populated by lib/stock.ts decrementStockForOrder (never throws).
create table if not exists public.stock_movements (
  id bigserial primary key,
  location_id text not null,
  item_id text not null,
  qty integer not null,                      -- units removed (positive)
  stock_before integer,
  stock_after integer,
  order_id uuid,
  order_no bigint,
  reason text not null default 'order',      -- 'order' | 'manual' | 'restock'
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_loc_item_idx
  on public.stock_movements (location_id, item_id, created_at desc);
create index if not exists stock_movements_created_idx
  on public.stock_movements (created_at desc);

alter table public.stock_movements enable row level security;

-- ---------- Reporting query indexes on the live orders table ----------
-- Additive indexes only — speed up date-range + status filters used by the
-- sales/items/locations/redemptions reports. No column changes to orders.
create index if not exists orders_paid_at_idx
  on public.orders (paid_at)
  where payment_status = 'PAID';
create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

-- ---------- Redemption OTP (staff anti-misuse) ----------
-- Separate from phone_otps so sending a redemption code never disturbs a
-- member's account verification. At the POS, redeeming free rewards requires a
-- code sent to the member's own WhatsApp — so staff can't quietly redeem.
-- Service-role only (RLS on, no policies).
create table if not exists public.redemption_otps (
  phone text primary key,                    -- canonical "+62XXXXXXXXXX"
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  last_sent_at timestamptz not null default now()
);

alter table public.redemption_otps enable row level security;
