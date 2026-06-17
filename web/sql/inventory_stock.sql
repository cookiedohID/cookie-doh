-- Cookie Doh — Inventory: add quantity stock to availability
-- Run this once in the Supabase SQL editor.
--
-- The existing table `flavor_availability` (flavor_id text, sold_out bool, updated_at)
-- gains an optional `stock` integer.
--   * stock = NULL  -> not tracked (treated as unlimited)
--   * stock = 0     -> out of stock (effective sold out)
-- Effective sold-out shown to customers = sold_out OR (stock IS NOT NULL AND stock <= 0)
--
-- `flavor_id` also stores smoothie ids (e.g. "berry-bloom") so the same table
-- powers cookie and smoothie inventory.

alter table public.flavor_availability
  add column if not exists stock integer;

-- Optional: helpful index if the table grows (safe to skip).
-- create index if not exists flavor_availability_flavor_id_idx
--   on public.flavor_availability (flavor_id);
