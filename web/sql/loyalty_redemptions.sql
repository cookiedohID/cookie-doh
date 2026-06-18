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
