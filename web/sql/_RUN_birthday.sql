-- ============================================================
-- Cookie Doh — birthday rewards.
-- Run once in the Supabase SQL editor.
--
-- We store only month-day ("MM-DD") — no birth year — so the reward recurs each
-- year and we don't collect age. The daily cron grants a free cookie on the day.
-- ============================================================
alter table public.customers add column if not exists birthday text; -- "MM-DD"
create index if not exists customers_birthday_idx on public.customers (birthday) where birthday is not null;
