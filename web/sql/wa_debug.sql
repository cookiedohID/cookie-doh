-- TEMP diagnostic: capture raw Fonnte webhook payloads to learn whether Fonnte
-- forwards the owner's own outgoing replies (needed for human-takeover pause).
-- Safe to drop once we've inspected a few rows.
create table if not exists public.wa_debug (
  id uuid primary key default gen_random_uuid(),
  raw jsonb,
  created_at timestamptz not null default now()
);
alter table public.wa_debug enable row level security;
