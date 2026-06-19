# Cookie Doh — User & Operations Manual

A complete guide to every function of the Cookie Doh platform: the **website**, the
**cafe POS**, and the **admin back office**.

> Live site: **https://www.cookiedoh.co.id**
> Brand line: *where the cookie magic happens* 🍪

---

## Contents
1. [The three areas](#1-the-three-areas)
2. [Website (storefront) functions](#2-website-storefront-functions)
3. [Membership & loyalty](#3-membership--loyalty)
4. [Cafe POS functions](#4-cafe-pos-functions)
5. [Admin back office functions](#5-admin-back-office-functions)
6. [Delivery & pickup](#6-delivery--pickup)
7. [Notifications](#7-notifications)
8. [Behind the scenes (services)](#8-behind-the-scenes-services)
9. [One-time setup & maintenance](#9-one-time-setup--maintenance)

---

## 1. The three areas

| Area | URL | Who uses it |
|------|-----|-------------|
| **Website (storefront)** | `cookiedoh.co.id` | Customers |
| **Cafe POS** | `cookiedoh.co.id/cafe` | In-store staff / walk-in self-order |
| **Admin back office** | `cookiedoh.co.id/admin` | You (password-protected) |

A short in-app version of this manual also lives at **`/admin/help`**.

---

## 2. Website (storefront) functions

### Browse & build
- **Home (`/`)** — hero, featured flavours, quick links.
- **Build Your Box (`/build`)** — choose a **Box of 3** or **Box of 6**, then mix-and-match
  flavours. Box price is **Rp30,000 per cookie** (Box of 3 = Rp90,000, Box of 6 = Rp180,000).
- **Cookies (`/cookies`)** — browse all cookie flavours.
- **Smoothies (`/smoothies`)** — browse drinks.
- **Bundles (`/bundles`)** — fixed-price sets of cookies + drinks (customer picks the contents).
- **Assortments (`/assortments`)** — ready-made curated boxes; add in one tap.
- **Cart (`/cart`)** — review boxes/bundles before checkout.

### Checkout (`/checkout`)
- **Contact details** — name + WhatsApp number. *If a member is logged in, these
  pre-fill automatically (still editable).*
- **🎁 Send as a gift** — toggle to add a **handwritten card** (To / From / message,
  up to 300 characters). Prices are left off the box.
- **Fulfilment** — choose **Delivery** (same-day) or **Pickup**, then pick a **date & time**.
- **Delivery address** — Google-powered address search; saved-address chips appear for
  logged-in members. A live delivery quote is shown.
- **Notes** — optional special instructions.
- **Payment** — QRIS / card via Midtrans. The order is confirmed once payment succeeds.

---

## 3. Membership & loyalty

### Member account (`/account`)
- **Sign up / log in** with email + password **or** Google.
- The **phone number is the member ID**, verified by a one-time code sent on **WhatsApp**.
- **Forgot password** — a reset link is on the login page (`/account/login`).
- The account shows:
  - **Membership QR code** (scanned in-store to earn/redeem)
  - **Loyalty progress** (cookie & drink stamps)
  - **My Orders** (`/account/orders`) — full history, cafe + online, items link back to reorder
  - **Saved Addresses** (`/account/addresses`) — add/edit multiple, set a default

### Loyalty rules
- **10 cookies → 1 free cookie**, **10 drinks → 1 free drink** (tracked separately).
- **Earns stamps:** single cookies/drinks, **boxes**, and **assortments**.
- **Does NOT earn:** **bundles**, free reward items, and other promotional items.
- Progress **never resets** — leftovers roll forward (e.g. 12 cookies = 1 free + 2 toward the next).
- Free rewards are calculated from **paid** orders only.

---

## 4. Cafe POS functions

Open **`/cafe`** on the in-store tablet/register. It runs as a **full-screen kiosk**
(the storefront menu/nav is hidden so a customer can't wander off).

- **Sections** — Assortments, Boxes, Bundles, Cookies, Drinks (jump via the top nav).
- **Add items** — tap to add singles; build a box (pick N cookies) or a bundle.
- **💡 Box nudge** — if a customer has **3+ single cookies**, a banner suggests a box and
  shows the saving (boxes are cheaper per cookie). "View boxes" jumps to the box section.
- **Members:**
  - **Scan QR** (📷) or type the member's phone, then "Rewards".
  - A big **"👋 Welcome, [name]"** banner shows their points — so a walk-in immediately
    notices if the wrong member is attached. **"Not you? ✕"** detaches it.
  - The member **clears automatically after every order** (so it can't stick as a default).
- **Redeeming free rewards (secure):** tap **"🔒 Use free cookie/drink"** → a code is sent
  to **the member's own WhatsApp** → they read it to staff → enter it to confirm. This stops
  staff from redeeming someone's rewards without the member present.
- **Checkout** — review, then charge by **QRIS**. On payment it prints and returns to the
  start screen. After ~5 minutes idle it also returns to the start screen.

---

## 5. Admin back office functions

Go to **`/admin`** and sign in with the **admin password**. Every admin page and action is
behind this login. **Log out** is in the top-right of the admin header.

### Home (`/admin`)
A dashboard with cards linking to each section.

### Orders (`/admin/orders`)
- List of **all orders** (cafe + online), newest first, with status filters and a schedule-date filter.
- **Click a row** → full **order detail**: customer name/phone/email, delivery address,
  items, totals, payment & fulfilment status, and the **🎁 gift card** block if it's a gift.
- **Actions:** mark **Paid / Sending / Sent**, **Book Lalamove**, **WhatsApp Admin** (send an
  update), open **Track** link.
- **🗑 Delete** a single order, or **🗑 Delete all unpaid** to clear test/abandoned orders in
  one go (it never touches paid orders).

### Inventory (`/admin/flavors`, also `/admin/inventory`)
- Set **stock per location** for each item, or mark an item **sold out** at a location.
- **No number = unlimited** (never sells out). Type a number to start tracking it.
- An item is unavailable at a location if it's **flagged sold-out OR stock ≤ 0**.

### Locations & transfer (`/admin/locations`)
- **Add / edit / delete stores** (name, short label, address).
- **🔄 Internal transfer** — move an item's stock from one store to another. Counts update at
  both stores and the move is logged. *Transferring stock in also clears the "sold out" flag.*
- New locations are **inventory/transfer points**; delivery still ships from your existing stores.

### Reports (`/admin/reports`)
Filter by **date range** and **location** at the top. Tabs:
- **Daily sales** — revenue + order count per day. **Click a date** to expand its orders;
  **click an order** to open its full detail.
- **By item** — quantity sold + revenue per item.
- **Locations** — sales compared across stores.
- **Inventory** — current stock + a **movement history** (sales and transfers).
- **Redeemed** — free items actually given out.

### Customers (`/admin/customers`)
- Search customers by name; open one to see their orders, totals, and loyalty.

### Manual (`/admin/help`)
- The in-app quick version of this document.

---

## 6. Delivery & pickup
- **Same-day delivery** via **Lalamove** to the Greater Jakarta + Bekasi service area
  (the checkout address field checks coverage and shows a live quote).
- **Pickup** at your configured pickup points.
- **Tracking** links appear on the order once a shipment is created (Biteship).
- *Intercity next-day shipping is possible to add (Biteship supports it) — not enabled yet.*

---

## 7. Notifications
- **On a paid order:** you get a **WhatsApp** alert (Fonnte) **and** an **email** (Resend).
- **Customers** get WhatsApp updates + order confirmations, and WhatsApp codes for
  phone verification and reward redemption.

---

## 8. Behind the scenes (services)
| Function | Provider |
|----------|----------|
| Payments (QRIS/card) | **Midtrans** |
| Database & login | **Supabase** |
| Same-day delivery | **Lalamove** |
| Shipments & tracking | **Biteship** |
| WhatsApp messages | **Fonnte** |
| Email | **Resend** |
| Hosting (auto-deploys on changes) | **Vercel** |
| Sign in with Google | **Google OAuth** |

---

## 9. One-time setup & maintenance
- **Admin password** — set as `ADMIN_BASIC_PASS` in Vercel.
- **Database migrations** — SQL files in `web/sql/` are run once in the Supabase SQL editor
  (reporting/addresses/redemption-OTP and locations migrations).
- **Reset/verification emails** — for reliable delivery, point Supabase Auth SMTP at Resend.
- **Google consent screen** — to show "CookieDoh" + logo instead of the Supabase address,
  finish branding verification in the Google Auth Platform (domain already verified).

---

*Cookie Doh — where the cookie magic happens 🍪*
