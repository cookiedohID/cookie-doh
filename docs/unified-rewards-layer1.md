# Unified rewards — Layer 1 spec (Cookie Doh × TBS)

**Goal.** In the Cookie Doh customer account (`/account`), show a customer their
rewards + purchase history across **both** businesses, in one place, split into
two tabs — **Cookie Doh** and **TBS** — each showing that business's rewards and
history. Read-only, federated (linked by phone). No data migration; each system
keeps its own loyalty engine and its own database.

Status: **DRAFT — not built.** This drives work across two repos.

---

## 1. The model (unchanged from the agreed design)

One customer = one WhatsApp number. Under that identity sit independent wallets,
each with its own earning rule — they never cross-convert:

| Wallet | Lives in | Rule |
|---|---|---|
| 🍪 Cookie stamps | Cookie Doh (Supabase) | buy 10 cookies → 1 free cookie |
| 🥤 Smoothie stamps | Cookie Doh (Supabase) | buy 10 smoothies → 1 free smoothie |
| 💰 Rupiah points | TBS / Kurly (Cloud Run + `tbs_retail`) | % of (selling − cost) |

The Cookie Doh two already exist today (`web/lib/loyalty.ts` →
`cookieStamps`/`freeCookies`, `drinkStamps`/`freeDrinks`). Only the TBS wallet is new to the view.

---

## 2. Identity & matching

- **Key = normalized WhatsApp phone** in E.164 (`+62812…`). Both systems normalize:
  strip spaces/`-`/`()`; leading `0` → `+62`; leading `62` → `+62`; already-`+62` kept.
- Cookie Doh already authenticates the phone via **WhatsApp OTP** at login, so the
  logged-in session's phone is trusted. Cookie Doh passes **that** phone to TBS —
  never a user-typed one — so a customer can only ever see their **own** TBS data.
- No match on the TBS side → the TBS tab shows a friendly "not a TBS member yet"
  state (soft CTA to join at a TBS store). Same in reverse is impossible here
  because the entry point is always the Cookie Doh login.

---

## 3. Architecture / data flow

```
Browser (logged-in customer)
   │  loads /account
   ├─ Cookie Doh tab  ← existing Cookie Doh data (loyalty + orders), no new calls
   └─ TBS tab
        │  GET /api/account/tbs         (Cookie Doh Next server route)
        │     - reads session phone (already OTP-verified)
        │     - server-to-server call, token kept server-side:
        ▼
   TBS Cloud Run  GET /api/partner/member-rewards?phone=+62…
        │  Authorization: Bearer <PARTNER_API_TOKEN>
        │  reads tbs_retail (member + points + recent receipts)
        ▼
   { found, member, points, history }  → Cookie Doh renders the TBS tab
```

Key point: the TBS call is **server-to-server** (Cookie Doh's Next backend → TBS
Cloud Run). The shared token never reaches the browser, and Cookie Doh enforces
"only the authenticated session's phone."

---

## 4. TBS endpoint contract (NEW — build in the `tbs-backoffice` repo)

`GET /api/partner/member-rewards`

**Auth:** `Authorization: Bearer <PARTNER_API_TOKEN>` (shared secret, env var on both
sides). Missing/wrong → `401`. Read-only; no writes ever.

**Query:** `phone` (required, E.164).

**Response 200:**
```json
{
  "found": true,
  "member": {
    "name": "Angelia",
    "phone": "+62812xxxxxxx",
    "tier": "Silver",
    "memberSince": "2025-03-01"
  },
  "points": {
    "balance": 125000,
    "unit": "IDR-points",
    "expiring": [ { "amount": 20000, "on": "2026-09-30" } ]
  },
  "history": [
    {
      "date": "2026-06-28T10:12:00+07:00",
      "store": "RC Veteran",
      "receiptNo": "TBS-000123",
      "total": 84000,
      "pointsEarned": 1260,
      "items": [
        { "name": "Apel Fuji 1kg", "qty": 1, "amount": 32000 },
        { "name": "Susu UHT 1L",   "qty": 2, "amount": 52000 }
      ]
    }
  ]
}
```
- No member for that phone → `{ "found": false }` (200, not an error).
- `history` = most recent **N** receipts (default 20). `items` optional depth — can
  omit line items in v1 and return receipt totals only if that's simpler on the ERP side.
- All money in IDR (integers). `expiring` optional (empty array if TBS points don't expire).

---

## 5. Cookie Doh side (build in THIS repo)

- **Env:** `TBS_PARTNER_API_URL`, `TBS_PARTNER_API_TOKEN`.
- **New route** `web/app/api/account/tbs/route.ts`:
  - resolves the session's OTP-verified phone (same auth the account page already uses),
  - calls the TBS endpoint with the bearer token,
  - normalizes + returns JSON to the client,
  - caches per-phone ~60s to avoid hammering the ERP; on TBS error/timeout returns
    `{ ok:false }` so the tab degrades gracefully (shows "couldn't load TBS right now").
- **Account page** `web/app/account/page.tsx`: add a **tabbed "Rewards & history"** section.
  - **Cookie Doh tab:** cookie stamps (x/10), smoothie stamps (x/10), free
    cookies/drinks available, VIP tier chip → then Cookie Doh order history.
  - **TBS tab:** rupiah-points balance (+ "expiring soon" if any), tier → then TBS
    receipt history. `found:false` → "Link your TBS membership" empty state.
- Tabs are client-side only (no reload); the TBS tab lazy-loads on first open.

---

## 5.1 Branding — each tab is its own brand

The two tabs are **not** one shared UI with different accent colours — each tab
renders fully in that business's own identity (colour, typography, wordmark), so the
customer feels they've switched between two separate brands.

- **Cookie Doh tab:** Cookie Doh blue `#0014a7`, the `cookie doh` wordmark (dearjoe
  font, already loaded), the tagline *where the cookie magic happens*, sand/cream
  surfaces — matching the storefront.
- **TBS tab:** TotalBuahStore identity (from `TBS Brand Guideline.pdf` v1.1) —
  primary **red `#9c1216`** + secondary **green `#135232`**, the **"tbs" cherry logo**,
  and the tagline **100% Fresh. Today and Always** (verbatim, TBS's counterpart to
  Cookie Doh's "where the cookie magic happens"). **Typography: use the Cookie Doh app
  font** for all text (owner's call — the
  TBS specialty faces Intro Rust / A Song for Jennifer don't read well in a
  receipt/purchase-history list). Brand differentiation here is **colour + logo only**,
  not type.
- **Implementation:** scope each panel with its own theme wrapper (`.theme-cd` /
  `.theme-tbs`) that swaps the brand **colours** and the **logo/header** with the tab;
  both panels share the Cookie Doh app font. Use the actual **tbs logo asset** in the
  TBS header. Keep the Cookie Doh tagline **verbatim** (trademarked). Colour and logo
  are what distinguish the two tabs — not typography.
- **Name to confirm:** the guideline says **TotalBuahStore**; the store locations say
  **Total Buah Segar**. Confirm which is customer-facing before spelling it out (the
  logo mark sidesteps this).

---

## 6. Privacy & security

- Shared token lives **server-side only** (both ends), never in the browser.
- Cookie Doh passes only the **authenticated session phone** — a customer cannot
  query another number.
- TBS returns data for exactly the requested phone; no listing/enumeration endpoint.
- Server-to-server, so no CORS surface. Rate-limit + short cache on the Cookie Doh proxy.

---

## 7. Explicitly NOT in Layer 1 (future layers)

- No points ⇄ stamps conversion (wallets stay independent).
- No writes to TBS (earning/spending TBS points stays in the ERP/POS).
- No merged customer database (federation only).
- No unified single sign-on — the Cookie Doh OTP session is the entry point.

---

## 8. Effort

- **TBS side:** one read endpoint over `tbs_retail` (member + points + recent receipts). Small.
- **Cookie Doh side:** one proxy route + one tabbed account section. Small.

---

## 9. Open questions for the owner

1. **History depth & detail:** last 20 receipts OK? Show **line items** per receipt,
   or just **receipt totals** to start? (default: 20 receipts, totals, with line
   items if easy on the ERP side.)
2. **Points expiry:** do TBS rupiah points expire? (drives the "expiring soon" chip.)
3. **Tier:** show the TBS tier in the TBS tab? (default: yes.)
