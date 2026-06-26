-- Cookie Doh — VIP tiers (annual to REACH, monthly to KEEP).
-- Effective tier = highest ACTIVE tier where:
--   • annual spend (trailing 12 months) >= reach_annual_idr, AND
--   • the member met maintain_monthly_idr in THIS or LAST calendar month (WIB)
--     (maintain_monthly_idr = 0 means no monthly upkeep — kept once reached).
-- Computed live from paid orders; no cron, no stored tier. Service-role only.
create table if not exists public.vip_tiers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  reach_annual_idr int not null,                 -- spend this in the last 12 months to reach
  maintain_monthly_idr int not null default 0,   -- calendar-month min to keep (0 = none)
  loyalty_per_free int not null default 10,       -- buy N -> 1 free (10 = no boost)
  free_delivery boolean not null default false,
  free_cookie_per_order boolean not null default false,
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists vip_tiers_reach_idx on public.vip_tiers (reach_annual_idr asc);
alter table public.vip_tiers enable row level security;
