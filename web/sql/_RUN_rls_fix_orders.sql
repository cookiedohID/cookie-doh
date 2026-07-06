-- RLS remediation — 2026-07-06 (found by leak test)
--
-- BUG: five tables carried a policy named "Allow all for service role - <t>"
-- that was actually written `FOR ALL TO public USING (true) WITH CHECK (true)`.
-- The service_role BYPASSES RLS and never needs a policy — so in practice this
-- granted the ANON / public role full read+write. Result: anyone holding the
-- browser-exposed anon key could read every customer's PII in orders/order_items
-- and insert/update/delete rows, and tamper with the catalog tables.
--
-- FIX:
--  • orders + order_items are accessed ONLY server-side (service-role client),
--    verified across app/api/**. Remove the policy entirely: RLS stays enabled
--    with zero policies = deny-all to anon/authenticated, while the service role
--    keeps working (it bypasses RLS). Matches every other sensitive table
--    (customers, phone_otps, … all have RLS on + 0 policies).
--  • flavor_availability / flavor_stock / store_locations feed the public
--    storefront. Keep them publicly READABLE but remove public WRITE by
--    replacing the FOR ALL policy with a FOR SELECT policy. (No app code writes
--    them via anon; writes are service-role/admin and bypass RLS regardless.)
--
-- Idempotent + reversible (recreate the old policy to roll back).

begin;

drop policy if exists "Allow all for service role - orders"       on public.orders;
drop policy if exists "Allow all for service role - order_items"  on public.order_items;

drop policy if exists "Allow all for service role - flavor_availability" on public.flavor_availability;
drop policy if exists "Allow all for service role - flavor_stock"        on public.flavor_stock;
drop policy if exists "Allow all for service role - store_locations"     on public.store_locations;

create policy "public read flavor_availability" on public.flavor_availability for select to public using (true);
create policy "public read flavor_stock"        on public.flavor_stock        for select to public using (true);
create policy "public read store_locations"     on public.store_locations     for select to public using (true);

commit;
