-- Cookie Doh — "Deliver to someone else" recipient on an order.
-- Run once (idempotent). The customer (buyer) is captured separately; these hold
-- the gift recipient's contact so the courier reaches THEM and the tracking
-- WhatsApp goes to THEM (mentioning the sender).
alter table public.orders add column if not exists recipient_name text;
alter table public.orders add column if not exists recipient_phone text;
