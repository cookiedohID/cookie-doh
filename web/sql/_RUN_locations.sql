-- ============================================================
-- Cookie Doh — Locations table (for managing stores + internal transfers).
-- Run ONCE in the Supabase SQL editor. Idempotent and additive.
-- Seeds your existing 4 stores so nothing changes on day one; new rows you
-- add from the admin become inventory/transfer points.
-- ============================================================

create table if not exists public.locations (
  id text primary key,                       -- slug, e.g. 'kemang', 'tbs-rcv'
  name text not null,
  short text,
  address text,
  lat double precision,
  lng double precision,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.locations enable row level security;

-- Seed the current 4 (no-op if already present).
insert into public.locations (id, name, short, address, lat, lng) values
  ('kemang',  'Cookie Doh — Kemang', 'Kemang',
     'Kemang Village Residence Infinity Tower unit ipn2, Jakarta Selatan', -6.2589497, 106.8123208),
  ('tbs-rcv', 'Total Buah Segar — RC Veteran (Bintaro)', 'RC Veteran',
     'Jl. RC. Veteran Raya No.208, Bintaro, Pesanggrahan, Jakarta Selatan 12330', -6.26234, 106.76635),
  ('tbs-ktr', 'Total Buah Segar — Karang Tengah (Lebak Bulus)', 'Karang Tengah',
     'Jl. Karang Tengah Raya, Lebak Bulus, Cilandak, Jakarta Selatan 12440', -6.30766, 106.78101),
  ('tbs-xmas','Total Buah Segar — KH Noer Ali (Bekasi)', 'Bekasi',
     'Jl. KH. Noer Ali No.9, Kayuringin Jaya, Bekasi Selatan, Jawa Barat 17144', -6.24735, 106.97999)
on conflict (id) do nothing;
