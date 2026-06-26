-- Cookie Doh — VIP tiers (lifetime-spend loyalty tiers).
-- A member's tier = highest ACTIVE tier whose min_lifetime_idr <= their total
-- paid spend. Perks: faster loyalty (buy-N-get-1), free same-day delivery, a
-- free cookie per order. Service-role only (RLS on, no anon policies).
create table if not exists public.vip_tiers (
  id uuid primary key default gen_random_uuid(),
  name text not null,                         -- shown to the member (e.g. "Gold")
  min_lifetime_idr int not null,              -- total paid spend to reach this tier
  loyalty_per_free int not null default 10,   -- buy N cookies -> 1 free (10 = no boost)
  free_delivery boolean not null default false,
  free_cookie_per_order boolean not null default false,
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists vip_tiers_threshold_idx on public.vip_tiers (min_lifetime_idr asc);
alter table public.vip_tiers enable row level security;
