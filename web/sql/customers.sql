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
