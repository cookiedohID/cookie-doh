-- Cookie Doh — permanently exclude a number from the WhatsApp auto-reply.
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- WHY THIS EXISTS. wa_state.auto_paused_until is a TEMPORARY mute: it lifts
-- once the chat has been idle ~2 hours, and /api/whatsapp/inbound rolls it
-- forward on every message. That is right for "a teammate is handling this
-- customer right now" and wrong for "this number is never a customer" —
-- a supplier, a partner atelier, our own other business line. Those need a
-- switch that does not expire.
--
-- bot_excluded = true  -> the bot never replies to this number and never
--                         escalates it to the owner. The messages are still
--                         recorded in wa_messages, so the chat stays readable
--                         in /admin/whatsapp.

alter table public.wa_state
  add column if not exists bot_excluded boolean not null default false;

comment on column public.wa_state.bot_excluded is
  'Permanent opt-out from the auto-reply (suppliers, partners, our own lines). '
  'Unlike auto_paused_until this never expires. Inbound messages are still stored.';

-- OSO Lampshade Atelier / Istana Lampion (+62 812-4934-7535) — a supplier, not
-- a customer. Requested excluded 2026-08-26.
insert into public.wa_state (phone, bot_excluded, updated_at)
values ('+6281249347535', true, now())
on conflict (phone) do update
  set bot_excluded = true,
      updated_at = now();
