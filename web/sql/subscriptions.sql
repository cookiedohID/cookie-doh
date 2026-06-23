-- Cookie Doh — Subscriptions (prepaid cookie-box plans)
-- Run once in the Supabase SQL editor (idempotent — safe to re-run).
--
-- Model: a customer configures a subscription once (box size 3/6, mode fixed|curated,
-- frequency weekly/biweekly/monthly), then PREPAYS a plan of N boxes with ONE Midtrans
-- QRIS payment (no card-on-file). Each box is "late-bound": a daily cron turns a due box
-- into a NORMAL paid public.orders row so all existing fulfilment/printing works, adds a
-- +1 bonus free cookie (free:true → earns no loyalty), and decrements stock. Renewal is a
-- fresh QRIS. Ownership mirrors customers: owner_phone (canonical +62) is identity,
-- auth_user_id is the login link — joined by phone like orders (no FK to customers.id).

-- ── 1) subscriptions — the long-lived editable config + state ────────────────────────
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
