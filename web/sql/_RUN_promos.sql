-- ============================================================
-- Cookie Doh — promo / discount codes.
-- Run once in the Supabase SQL editor.
--
--  promo_codes       : the codes the admin creates.
--  promo_redemptions : one row per PAID order that used a code (UNIQUE order_id
--                      makes recording idempotent against webhook retries). Usage
--                      limits are DERIVED by counting these rows — no counter to
--                      keep in sync.
-- ============================================================
create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,            -- stored UPPERCASE
  type text not null default 'percent', -- 'percent' | 'fixed'
  value int not null default 0,         -- percent (0-100) or fixed IDR off
  min_subtotal int not null default 0,  -- minimum merchandise subtotal to qualify
  max_discount int,                     -- cap for percent codes (IDR); null = no cap
  usage_limit int,                      -- total uses across everyone; null = unlimited
  per_customer_limit int not null default 1, -- uses per phone; 0 = unlimited
  starts_at timestamptz,
  expires_at timestamptz,
  active boolean not null default true,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  phone text,
  order_id uuid unique,                 -- idempotent recording
  discount_idr int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists promo_redemptions_code_idx on public.promo_redemptions (code);
create index if not exists promo_redemptions_phone_idx on public.promo_redemptions (phone);

alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;
