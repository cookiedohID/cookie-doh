-- Cloud migration P3 — self-hosted member identity table (replaces Supabase Auth).
-- Applied to the storefront DB (currently Supabase for staging/test; Cloud SQL at
-- cutover — identical DDL). RLS ENABLED with zero anon policies = deny-all to the
-- anon key (service-role bypasses), so password hashes/emails are never exposed —
-- same lockdown as orders/customers.

create table if not exists public.auth_user (
  id            uuid primary key,          -- SAME uuid as Supabase auth.users so
                                           -- customers.auth_user_id / phone_otps.auth_user_id survive
  email         text,
  password_hash text,                      -- bcrypt ($2…); null for Google-only members
  name          text,
  phone         text,
  google_sub    text,                      -- Google 'sub' (identities.provider_id); null for password-only
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists auth_user_email_key      on public.auth_user (lower(email)) where email is not null;
create unique index if not exists auth_user_google_sub_key on public.auth_user (google_sub)   where google_sub is not null;

alter table public.auth_user enable row level security;  -- 0 policies ⇒ anon denied

-- One-time backfill from Supabase Auth (run against the SAME DB that holds the
-- auth schema — i.e. Supabase, pre-cutover). Idempotent. Google sub comes from
-- auth.identities; name/phone/hash from the user row.
insert into public.auth_user (id, email, password_hash, name, phone, google_sub, created_at)
select
  u.id,
  u.email,
  nullif(u.encrypted_password, ''),
  coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name'),
  u.raw_user_meta_data->>'phone',
  (select i.provider_id from auth.identities i where i.user_id = u.id and i.provider = 'google' limit 1),
  u.created_at
from auth.users u
on conflict (id) do nothing;
