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

**Query:** `phone` (required, E.164). Optional paging for history: `offset` (default 0),
`limit` (default 20, max 100).

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
    "expiryMonths": 12,
    "expiring": [ { "amount": 20000, "on": "2027-06-28" } ]
  },
  "history": {
    "total": 47,
    "offset": 0,
    "receipts": [
      {
        "date": "2026-06-28T10:12:00+07:00",
        "store": "RC Veteran",
        "receiptNo": "TBS-000123",
        "total": 84000,
        "pointsEarned": 1260,
        "items": [
          { "sku": "FRT-APLFJ-1KG", "name": "Apel Fuji 1kg", "qty": 1, "amount": 32000,
            "url": "https://totalbuahstore.com/product/apel-fuji-1kg", "status": "in_stock" },
          { "sku": "DRY-SUHT-1L", "name": "Susu UHT 1L", "qty": 2, "amount": 52000,
            "url": "https://totalbuahstore.com/product/susu-uht-1l", "status": "out_of_stock" }
        ]
      }
    ]
  }
}
```
- No member for that phone → `{ "found": false }` (200, not an error).
- **Points expire 12 months after they're earned** (`expiryMonths: 12`). `expiring[]`
  lists upcoming expiries (amount + date) so the UI can warn "expiring soon".
- **History = detailed receipts** (line items required, not optional). Each receipt is
  **kept for 1 year**; return the most recent **20** by default and honour `offset`/`limit`
  (+ `history.total`) so the UI can **"load more"** back through the full year.
- Each item carries `sku`, `name`, `qty`, `amount`, a live product `url` on
  **`totalbuahstore.com`**, and `status` ∈ `in_stock` | `out_of_stock` | `discontinued`.
  The `url` is **always present** so a customer can tap to reorder; the store's own
  product page renders the out-of-stock / discontinued state when applicable (the
  endpoint just reports `status`; the tab badges it).
- All money in IDR (integers).

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
  - **TBS tab:** rupiah-points balance (+ "expiring soon" — points expire 12 months
    after earning), tier → then TBS **receipt history**. Each receipt expands to its
    **line items**; every item name is a **live link to its `totalbuahstore.com`
    product page** (tap to reorder). Items flagged `out_of_stock`/`discontinued` get a
    small badge but still link (the store page shows that state). Show the latest 20
    with **"load more"** paging back through the past year. `found:false` →
    "Link your TBS membership" empty state.
- Tabs are client-side only (no reload); the TBS tab lazy-loads on first open. Product
  links open in a new tab to `totalbuahstore.com` (external — outside the account app).

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
- **Name:** the customer-facing brand is **TotalBuahStore** (site: **totalbuahstore.com**),
  where the full name is shown; product reorder links point there.

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

## 9. Decisions (locked 2026-07-03)

- **Brand name / domain:** TotalBuahStore — **totalbuahstore.com**.
- **Points expiry:** points expire **12 months** after earning; show "expiring soon".
- **History:** show **20** at a time, **kept for 1 year** (load-more paging back a year).
- **Receipts:** **detailed line items**, each product a **live link** to its
  totalbuahstore.com page to ease reorder.
- **Out of stock / discontinued:** the item still links; the product page shows the
  out-of-stock / discontinued state (endpoint reports `status`, tab badges it).
- **Tier:** shown in the TBS tab.
- **TBS-tab typography:** Cookie Doh app font (readability); identity = colour + logo.
