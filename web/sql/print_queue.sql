-- Cookie Doh — Cafe print queue
-- Run once in the Supabase SQL editor.
--
-- The local print agent (print-agent/) polls for PAID cafe orders that haven't
-- been printed yet, prints the 3 docs, then marks them printed. One timestamp on
-- the order is all the bookkeeping we need.

alter table public.orders add column if not exists printed_at timestamptz;

-- Fast lookup of the unprinted paid-cafe queue.
create index if not exists orders_print_queue_idx
  on public.orders (paid_at)
  where printed_at is null;
