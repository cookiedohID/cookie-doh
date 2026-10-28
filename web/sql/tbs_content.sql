-- web/sql/tbs_content.sql — TotalBuahStore product CONTENT layer (2026-10-27).
-- Source of truth = the owner's Total-Buah-Product-Master.xlsx (edited via ChatGPT),
-- loaded by scripts/tbs-content-load.py (re-runnable; keyed on the sheet's
-- "Product ID (keep unchanged)"). Price + stock stay LIVE from the ERP partner
-- API; sheet_price is only the fallback shown when the ERP has no row for the SKU.
create table if not exists public.tbs_content_category (
  code text primary key,
  name text not null,
  icon text,
  icon_id text,
  display_order int not null default 999,
  subcategories jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.tbs_content_product (
  product_id text primary key,
  sku text,
  name text not null,
  slug text,
  category_code text,
  category_label text,
  subcategory_code text,
  record_type text not null default 'Existing',   -- Existing | Dummy | Legacy | Alias
  listed boolean not null default true,
  tagline text, price_note text, origin text, weight_contents text, storage text, notice text,
  story_heading text, story_intro text, description text, detail_heading text,
  checkpoints text[] not null default '{}',
  tip text, note text,
  content_status text, copy_review text,
  sheet_price int,
  primary_unit text,
  has_bundles boolean not null default false,
  images jsonb not null default '[]'::jsonb,      -- [{role, src_id, url, url_small, w, h, alt}]
  drive_folder_url text,
  barcodes text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists tbs_content_product_sku on public.tbs_content_product (sku);
create index if not exists tbs_content_product_cat on public.tbs_content_product (category_code) where listed;
create table if not exists public.tbs_content_variant (
  variant_id text primary key,
  product_id text not null references public.tbs_content_product(product_id) on delete cascade,
  variant_name text, variant_type text, price int, discounted_price numeric,
  pos_item_number text, barcode text, base_uom text, base_qty int, bundle_discount numeric, base_barcode text,
  updated_at timestamptz not null default now()
);
create index if not exists tbs_content_variant_product on public.tbs_content_variant (product_id);
create table if not exists public.tbs_content_recipe (
  recipe_id text primary key,
  product_id text not null references public.tbs_content_product(product_id) on delete cascade,
  display_order int not null default 1,
  title text not null, serving_note text,
  ingredients text[] not null default '{}', steps text[] not null default '{}',
  tbs_note text, source_name text, source_url text, review_status text,
  image_url text, image_alt text,
  shopping jsonb not null default '[]'::jsonb,   -- [{label, barcode, product_id, quantity}]
  updated_at timestamptz not null default now()
);
create index if not exists tbs_content_recipe_product on public.tbs_content_recipe (product_id);
create table if not exists public.tbs_content_fact (
  id bigserial primary key,
  product_id text not null references public.tbs_content_product(product_id) on delete cascade,
  kind text not null,              -- benefit | nutrition
  display_order int not null default 1,
  title text not null, description text, source_name text, source_url text, checked_date text, review_status text
);
create index if not exists tbs_content_fact_product on public.tbs_content_fact (product_id);
create table if not exists public.tbs_content_block (
  block_key text primary key,
  section text, heading text, body text, review_status text,
  updated_at timestamptz not null default now()
);
create table if not exists public.tbs_content_load (
  id bigserial primary key,
  loaded_at timestamptz not null default now(),
  source text, products int, variants int, recipes int, images int, orphans int, notes text
);
-- public read (the shop reads server-side with the service role anyway; RLS stays on, no anon policy needed)
alter table public.tbs_content_product enable row level security;
alter table public.tbs_content_variant enable row level security;
alter table public.tbs_content_recipe enable row level security;
alter table public.tbs_content_fact enable row level security;
alter table public.tbs_content_block enable row level security;
alter table public.tbs_content_category enable row level security;
alter table public.tbs_content_load enable row level security;
