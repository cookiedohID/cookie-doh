-- Cookie Doh — WhatsApp OTP store (phone verification via Fonnte)
-- Run once in the Supabase SQL editor.

create table if not exists public.phone_otps (
  phone text primary key,            -- canonical "+62..."
  code_hash text not null,           -- sha256 of the 6-digit code
  expires_at timestamptz not null,
  verified boolean not null default false,
  attempts integer not null default 0,
  last_sent_at timestamptz not null default now()
);

-- Bind a verification to the signed-in user who completed it, so a once-verified
-- phone can't later be claimed by a different account.
alter table public.phone_otps add column if not exists auth_user_id uuid;

-- Lock the table down: only the service role (used by our API routes) may touch
-- it. With RLS on and NO anon/authenticated policies, the public anon key can't
-- read code hashes or flip `verified`.
alter table public.phone_otps enable row level security;
