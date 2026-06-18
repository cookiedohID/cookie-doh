# Cookie Doh — Deployment & Go-Live Runbook

Everything needed to take the storefront + retail/loyalty/POS platform live, plus
the known follow-ups. Keep this current as the platform grows.

---

## 1. Database (Supabase SQL editor)

Run these once, in any order. All statements are idempotent (`if not exists` /
`add column if not exists`), so re-running is safe.

| File | Creates / changes |
|------|-------------------|
| `sql/customers.sql` | `customers` table (membership, loyalty counters) + **enables RLS** |
| `sql/locations.sql` | `location_stock` (per-store inventory) |
| `sql/phone_otps.sql` | `phone_otps` (WhatsApp OTP store) + `auth_user_id` column + **enables RLS** |

> `sql/inventory_stock.sql` is **obsolete** — superseded by `location_stock`. Don't run it.

### ⚠️ Security re-run required
`customers.sql` and `phone_otps.sql` were updated to **enable Row Level Security**
and add `phone_otps.auth_user_id`. If you ran earlier versions, **re-run both**.
Our API routes use the Supabase **service role** key (which bypasses RLS), so
nothing breaks — but with RLS on and no anon policies, the public anon key
shipped to the browser can no longer read customer PII or flip OTP `verified`.

Verify RLS is on: Supabase → Table editor → each table should show a "RLS enabled"
badge (or `select relrowsecurity from pg_class where relname='customers';` → `t`).

---

## 2. Environment variables

Set these in Vercel (Production + Preview). `NEXT_PUBLIC_*` are exposed to the
browser — never put secrets there.

### Core (required)
| Var | Notes |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser auth (login/signup only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server routes (bypasses RLS) — **secret** |
| `SUPABASE_URL` | Optional fallback for the service client |
| `NEXT_PUBLIC_SITE_URL` | e.g. `https://cookiedoh.id` — used in emails, Snap callbacks, admin links |

### Payments — Midtrans (required for checkout)
| Var | Notes |
|-----|-------|
| `MIDTRANS_SERVER_KEY` | **secret** |
| `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` | Snap.js client key |
| `MIDTRANS_IS_PRODUCTION` | `true` in prod |
| `NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION` | must match the above |
| `NEXT_PUBLIC_CHECKOUT_MODE` | `midtrans` (or `manual` for bank-transfer flow) |
| `NEXT_PUBLIC_MANUAL_PAYMENT_INSTRUCTIONS` | only if `manual` |

### Notifications (orders → admin)
| Var | Notes |
|-----|-------|
| `FONNTE_TOKEN` | WhatsApp gateway (device 081932181818) — **secret** |
| `ADMIN_NOTIFY_WHATSAPP` | where order alerts + OTPs are sent from/to |
| `RESEND_API_KEY` | email — **secret** |
| `ADMIN_NOTIFY_EMAIL` | where order emails go |
| `EMAIL_FROM` | verified-domain sender, e.g. `Cookie Doh <orders@cookiedoh.id>`; falls back to Resend's shared sender |

### Delivery — Lalamove (live quote) + Biteship (shipment)
`LALAMOVE_API_KEY` · `LALAMOVE_API_SECRET` · `LALAMOVE_ENV` · `LALAMOVE_MARKET` ·
`LALAMOVE_LANGUAGE` · `LALAMOVE_SERVICE_TYPE` · `LALAMOVE_PICKUP_PHONE` ·
`LALAMOVE_SERVICE_SAMEDAY_POOLING` · `LALAMOVE_SERVICE_INSTANT_PRIORITY` ·
`BITESHIP_API_KEY` · `BITESHIP_SHIPPER_NAME/EMAIL/PHONE/ORG` · `BITESHIP_ORIGIN_NOTE`

### Origin / pickup (nearest-store shipping)
`COOKIE_DOH_ORIGIN_CONTACT_NAME` · `COOKIE_DOH_ORIGIN_CONTACT_PHONE` ·
`COOKIE_DOH_ORIGIN_ADDRESS` · `COOKIE_DOH_ORIGIN_AREA_ID` ·
`COOKIE_DOH_ORIGIN_LAT` · `COOKIE_DOH_ORIGIN_LNG` (Kemang fallback origin) ·
`COOKIE_DOH_PICKUP_NAME/PHONE/ADDRESS/LAT/LNG` · `NEXT_PUBLIC_PICKUP_POINTS_JSON`

### Misc
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (Places autocomplete — Geocoding API is **denied**
on this key, the address flow uses Places only) · `ADMIN_TOKEN` +
`NEXT_PUBLIC_ADMIN_TOKEN` (admin auth) · `NEXT_PUBLIC_WHATSAPP_NUMBER` /
`NEXT_PUBLIC_WA_NUMBER` / `NEXT_PUBLIC_WHATSAPP_SUPPORT` (storefront WA button) ·
`SOFT_LAUNCH_ENABLED`.

---

## 3. Midtrans dashboard — pick ONE webhook

The repo ships **two** payment-notification handlers and you must point Midtrans
at exactly one:

- **`/api/midtrans/notification`** — recommended. State-machine shipment lock
  (`not_created → creating → created`), cafe-order branch, stock decrement,
  Biteship wrapped in try/catch → `needs_attention` on failure.
- `/api/midtrans/webhook` — older sibling; guards on `biteship_order_id`.

Set **Settings → Configuration → Payment Notification URL** to
`https://<your-domain>/api/midtrans/notification`. Pointing at both can
double-create shipments (their idempotency markers don't see each other).
**TODO:** delete the unused route once confirmed.

---

## 4. Supabase Auth
- **Email → Confirm email: OFF** (so member signup returns a session immediately). ✅ done
- Enable **Google** provider for "Continue with Google" (Apple deferred).

## 5. Fonnte (WhatsApp)
- Free plan adds a "sent via fonnte.com" watermark to messages — remove by
  applying a paid package **to the device**, or swap to Watzap (1-file change in
  `lib/whatsapp.ts`).
- Fonnte's separate **"AI data / AI quota"** add-on (auto-reply chatbot) is being
  **deprecated (announced for 1 June 2026)** — don't buy it. We only use Fonnte
  for outbound OTP + order alerts.

---

## 6. Pre-launch smoke test
1. `npm run build` passes.
2. Place a test order (Midtrans sandbox) → admin gets WhatsApp + email "NEW ORDER".
3. Pay it → admin gets "ORDER PAID"; `location_stock` decremented; (delivery) Biteship shipment created.
4. Member signup → WhatsApp OTP received → `/account` shows membership QR + loyalty.
5. Cafe POS → add items → Charge QRIS → receipt / stickers / recipe print.

---

## 7. Known follow-ups (tech debt)

Tracked from the pre-commit adversarial review. None block launch.

### Loyalty redemption double-spend (medium — **do before heavy promo use**)
Reward availability is derived only from **PAID** orders. A free line on a
**PENDING** order doesn't reduce the balance until the webhook marks it PAID, so
two rapid cafe checkouts for the same member can each see the same balance and
both settle → more free items than earned. Bounded (in-store, each non-free item
is still paid), but real.

**Proposed fix (atomic reservation):**
1. New `loyalty_redemptions(id, phone, kind, qty, order_id, status, created_at)`
   table, or use the existing dead `customers.cookies_redeemed/drinks_redeemed`.
2. A Postgres RPC `reserve_rewards(phone, cookies, drinks)` that takes
   `pg_advisory_xact_lock(hashtext(phone))`, computes available
   (earned − reserved − consumed), and inserts reservation rows only if
   `available >= requested`, returning success/failure atomically.
3. Cafe checkout calls the RPC **before** creating the order; release/expire the
   reservation if the order isn't paid within N minutes (or on webhook FAILED).
4. Count `reserved` + `consumed` toward redeemed in `loyaltyFromOrders`.

Deferred because a half-built atomic path on a live checkout is worse than the
bounded leak — needs supervised testing.

### Other deferred items
- **Cafe checkout still trusts client `free` flag** — price + kind are now
  server-authoritative (fixed), but `free` is only validated against the racy
  availability check above; fold into the reservation RPC.
- **OTP brute-force hardening** — has a 5-attempt cap; make the attempts
  increment atomic and rate-limit `send`/`verify` per IP.
- **Stock decremented before shipment confirmed** — now recoverable
  (`needs_attention`); ideally tie stock decrement to shipment success.
- **Two Midtrans webhooks** — see §3; delete the unused one.
