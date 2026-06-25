-- Cookie Doh — WhatsApp AI assistant (inbound) state.
-- Run once (idempotent). Service-role only (RLS on, no anon policies).

-- Rolling conversation memory, one row per message, keyed by canonical phone.
create table if not exists public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  phone text not null,                         -- canonical 62xxxxxxxxxx
  role text not null check (role in ('user', 'assistant')),
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists wa_messages_phone_idx on public.wa_messages (phone, created_at desc);

-- Per-number state: pause the bot after a human takeover, and dedupe inbound.
create table if not exists public.wa_state (
  phone text primary key,                      -- canonical 62xxxxxxxxxx
  auto_paused_until timestamptz,               -- bot stays quiet until this time (human handling)
  last_inbound_id text,                         -- Fonnte message id, for dedupe
  updated_at timestamptz not null default now()
);

alter table public.wa_messages enable row level security;
alter table public.wa_state enable row level security;
