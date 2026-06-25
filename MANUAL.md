# Cookie Doh — User & Operations Manual

A complete guide to every function of the Cookie Doh platform: the **website**, the
**cafe POS**, and the **admin back office**.

> Live site: **https://www.cookiedoh.co.id**
> Brand line: *where the cookie magic happens* 🍪

---

## Contents
1. [The three areas](#1-the-three-areas)
2. [Website (storefront) functions](#2-website-storefront-functions)
3. [Membership, loyalty & rewards](#3-membership-loyalty--rewards)
4. [Cafe POS functions](#4-cafe-pos-functions)
5. [Admin back office functions](#5-admin-back-office-functions)
6. [Marketing, growth & retention](#6-marketing-growth--retention)
7. [Automatic background jobs](#7-automatic-background-jobs)
8. [Delivery & pickup](#8-delivery--pickup)
9. [Notifications](#9-notifications)
10. [Behind the scenes (services)](#10-behind-the-scenes-services)
11. [Setup & maintenance](#11-setup--maintenance)
12. [Subscriptions](#12-subscriptions)

---

## 1. The three areas

| Area | URL | Who uses it |
|------|-----|-------------|
| **Website (storefront)** | `cookiedoh.co.id` | Customers |
| **Cafe POS** | `cookiedoh.co.id/cafe` | In-store staff / walk-in self-order |
| **Admin back office** | `cookiedoh.co.id/admin` | You (password-protected) |

A short in-app version of this manual lives at **`/admin/help`**. A customer-facing
FAQ lives at **`/help`** (linked in the website footer).

> **You can run all of this from your phone.** The admin, POS, and customer site are
> all just web pages — open them in any phone browser, log into `/admin` once, and
> manage everything from anywhere.

---

## 2. Website (storefront) functions

### Browse & build
- **Home (`/`)** — hero, featured flavours, quick links. Signed-in members also see a
  **👋 Your usuals** strip — their most-ordered cookies & drinks with one-tap **+ Add**, plus
  shortcuts to their usual box size and go-to bundle. (Invisible to guests / members with no history.)
- **Build Your Box (`/build`)** — choose a **Box of 3** or **Box of 6**, then mix-and-match
  flavours. Box price is **Rp30,000 per cookie** (Box of 3 = Rp90,000, Box of 6 = Rp180,000).
- **Flavours (`/flavors`)** — browse all cookie flavours. Sold-out flavours show a **Sold out**
  badge and a **"🔔 Notify me when back"** button (see [Back-in-stock](#back-in-stock-alerts)).
- **Cookies / Smoothies / Bundles / Assortments** — browse singles, drinks, fixed-price sets,
  and ready-made curated boxes.
- **Cart (`/cart`)** — review boxes/bundles before checkout. A **"Complete your order"** strip
  suggests popular single cookies with one-tap **+ Add** (an easy upsell; each earns a loyalty stamp).

### Checkout (`/checkout`)
- **Contact details** — name + WhatsApp number. *Pre-fills for logged-in members (still editable).*
- **🎁 Send as a gift** — adds a **handwritten card** (To / From / message, up to 300 chars);
  prices are left off the box.
- **📦 Delivering to someone else?** (delivery only) — capture the **recipient's name + WhatsApp**.
  The **buyer** stays the customer (gets the receipt/confirmation), but the **courier contacts the
  recipient** and the **"on its way" tracking goes to the recipient** (mentioning who sent it). An
  opt-in adds a **referral invite**: if the recipient isn't a customer yet, we WhatsApp them the
  buyer's referral link so **both get a free cookie** when the recipient orders their first box.
- **Fulfilment** — **Delivery** or **Pickup**, then pick a **date & time**.
- **Delivery address** — Google address search; saved-address chips for members; live quote.
- **🎟️ Promo code** — enter a code and tap **Apply** to see the discount before paying.
- **🎁 Redeem free rewards** — a logged-in member with earned free cookies/drinks can apply them
  here (validated against their real balance).
- **Payment** — QRIS / card via Midtrans. The order confirms once payment succeeds.
- **Order confirmation (`/checkout/success`)** shows the result; **`/account/orders`** keeps the
  full history (pickup point or delivery address, date/time, and any gift note).

---

## 3. Membership, loyalty & rewards

### Member account (`/account`)
- **Sign up / log in** with email + password **or** Google. The **phone number is the member ID**,
  verified by a one-time code on **WhatsApp**. **Forgot password** link is on `/account/login`.
- The account shows:
  - **Membership QR code** (scanned in-store to earn/redeem)
  - **Loyalty progress** (cookie & drink stamps + any free rewards ready)
  - **🎂 Your birthday** — set month + day once for a yearly free-cookie surprise
  - **🎁 Refer a friend** — your personal link + "Share on WhatsApp" button
  - **My Orders** (`/account/orders`) and **Saved Addresses** (`/account/addresses`)

### Loyalty rules
- **10 cookies → 1 free cookie**, **10 drinks → 1 free drink** (tracked separately).
- **Earns stamps:** every cookie/drink you buy — single cookies/drinks, **boxes**, **assortments**, and **bundles**.
- **Does NOT earn:** only **redeemed free rewards** (the free cookie/drink you cash in).
- Progress **never resets** — leftovers roll forward. Free rewards come from **paid** orders only.

### Where free rewards come from
A member's available free cookies/drinks = **earned stamps + bonus grants − already redeemed**.
"Bonus grants" are free cookies given outside the buy-10 engine:
- **Referral** rewards (both sides, see below)
- **Birthday** rewards
These appear in the same balance and are redeemable the same way (POS or online checkout).

---

## 4. Cafe POS functions

Open **`/cafe`** on the in-store tablet/register — a **full-screen kiosk** (storefront nav hidden).

- **Sections** — Assortments, Boxes, Bundles, Cookies, Drinks.
- **Add items** — tap singles; build a box (pick N cookies) or a bundle.
- **💡 Box nudge** — 3+ single cookies prompts a "switch to a box and save" banner.
- **Members:** **Scan QR** (📷) or type the phone, then **Rewards** (or press **Enter**). A big
  **"👋 Welcome, [name]"** banner shows their points; **"Not you? ✕"** detaches. The member is
  **locked** after lookup and **clears after every order**.
- **Redeeming free rewards (secure):** a one-time code is sent to **the member's own WhatsApp**;
  they read it to staff to confirm — so rewards can't be redeemed without the member present.
  A **free-reward picker** limits choices to what they actually have. **Free-only redemptions are
  allowed** (no purchase required).
- **Subscription rewards in-store:** if the member has a **🔁 subscription reward** (buy 6, get 1
  free), staff tap **Use subscription reward** (same WhatsApp-OTP confirmation) and pick the flavour —
  it's added free. This draws the **separate** subscription pool, not the buy-10 loyalty.
- **Checkout** — review, charge by **QRIS**, prints, returns to start (also after ~5 min idle).

---

## 5. Admin back office functions

Go to **`/admin`** and sign in with the **admin password**. Everything is behind this login;
**Log out** is in the top-right. The home page links to each section.

### Orders (`/admin/orders`)
- All orders (cafe + online), newest first, with status/date filters.
- **Click a row** → full detail: customer, address, items, totals, payment & fulfilment status,
  the **🎁 gift card** block, and any **🎟️ promo / discount** applied.
- **Actions:** mark Paid / Sending / Sent, Book Lalamove, WhatsApp the customer, open Track.
- **🗑 Delete** one order, or **🗑 Delete all unpaid** to clear test/abandoned orders (paid are safe).
- **Acceptance (new orders):** every paid order shows ✅ *Accepted* or ⏳ *Not accepted yet*. While
  it's unaccepted you get a **WhatsApp reminder every hour** (up to 24h). Press **Accept order** to
  stop the reminders (advancing fulfilment to baking/sent/completed also accepts it automatically).
- **Message the customer:** **🚚 On its way + track link** WhatsApps the customer their tracking link
  and marks the order accepted + sent. **Re-send order details** sends the order confirmation again.
- Customers also get an **automatic confirmation WhatsApp** the moment their payment succeeds.

### Inventory (`/admin/flavors`)
- Set **stock per location**, or mark an item **sold out** at a location. **No number = unlimited.**
- An item is unavailable at a location if it's **flagged sold-out OR stock ≤ 0**.
- The website shows a flavour as sold out only when **every** tracked store is out. Flipping it
  back to available **WhatsApps everyone who asked to be notified** (see Back-in-stock).

### Locations & transfer (`/admin/locations`)
- Add / edit / delete stores. **🔄 Internal transfer** moves stock between stores (logged;
  transferring stock in also clears "sold out").

### Reports (`/admin/reports`)
Filter by date range + location. Tabs: **Daily sales** (click a date → its orders → an order),
**By item**, **Locations**, **Inventory** (+ movement history), **Redeemed** (free items given out).

### Customers (`/admin/customers`)
- Search by name; open one to see orders, totals, and loyalty (including bonus grants).

### Broadcast (`/admin/broadcast`)
- Send a WhatsApp to a **segment** of everyone who's ever ordered. See [Marketing](#broadcast).

### Promo codes (`/admin/promos`)
- Create & manage discount codes. See [Promo codes](#promo-codes).

### Manual (`/admin/help`)
- The in-app quick version of this document.

---

## 6. Marketing, growth & retention

### Broadcast
`/admin/broadcast` — pick **who** gets it and write the message.
- **Segments:** Everyone (every customer who's ordered + all members), Active (ordered in 30 days),
  Lapsed (45+ days quiet), VIPs (3+ orders or Rp300k+ spent). The live recipient count updates as
  you choose.
- Use **`{name}`** to personalise. A "Reply STOP to opt out" line is added automatically.
- Costs a small amount per WhatsApp — only message people who expect to hear from you.

### Promo codes
`/admin/promos` — create a code (percent **or** fixed amount off), with optional **min spend**,
**max-discount cap** (for percent), **total uses**, **uses per customer**, and **expiry**. Pause or
delete any code; usage is shown per code.
- Customers enter the code at checkout; the discount is **recomputed on our server** (never set by
  the browser) and applied to the merchandise subtotal.
- Great paired with a **Broadcast** ("Use LAVENDER15 this week").
- *Note:* usage limits are best-effort across many simultaneous unpaid checkouts — fine for
  marketing codes; tell us before relying on a strictly single-use, high-value code.

### Spend rewards — "spend Rp X, add a cookie for Rp Y"
`/admin/spend-rewards` — reward bigger baskets with a cheap add-on. Create a **tier**:
- **Spend at least (Rp)** — the qualifying merchandise subtotal that unlocks it (e.g. 300.000).
- **Reward name** — what the customer sees (e.g. "Bonus cookie").
- **Reward price (Rp)** — the special price they pay for it (e.g. 30.000 — or 0 to make it free).
- **Reward cookies** — pick which cookie(s) + how many make up the reward.
- **Pause / Activate / Delete** any tier from the list (`Spend 300k → Bonus cookie for 30k`).

How customers see it: at checkout, once their qualifying subtotal hits a tier, they can add that
reward at its special price; they always get the **highest** tier they qualify for, plus a "spend a
bit more to unlock …" nudge for the next one. Everything is **re-validated on our server** — they
can't keep the cheap reward after dropping below the threshold, or swap in pricier cookies. (Reward
cookies earn loyalty stamps like any purchased cookie.)

### Referrals — give a cookie, get a cookie
- Every member gets a **referral link** in `/account` (`/?ref=THEIRCODE`) + a WhatsApp share button.
- When a **new** customer orders their **first** box worth **at least a box of 6 (Rp180k merchandise)**
  using that link, **both** the member and the friend get **+1 free cookie**, and both get a WhatsApp.
- One reward per friend (ever); a refund of the qualifying order **reverses** the bonus.
- The daily digest flags anyone racking up an unusual number of referrals.

### Birthday rewards
- Members set a **month + day** in `/account` (no birth year collected).
- Each morning the system grants a **free birthday cookie** + sends a "Happy birthday" WhatsApp to
  anyone whose birthday is that day. One per member per year.

### Back-in-stock alerts
- On a **sold-out** flavour card, customers tap **"🔔 Notify me when back"** and leave a phone number.
- When you flip that flavour back to available in **Inventory**, everyone subscribed gets a WhatsApp
  and the list is cleared.

### Abandoned-cart nudge
- If someone starts checkout but doesn't pay within ~1 hour, they get **one** friendly WhatsApp with
  a link to finish paying (their saved payment popup reopens). Runs hourly; one nudge per cart.

---

## 7. Automatic background jobs

These run on their own (scheduled via **GitHub Actions**, hourly/daily):

| Job | When | What it does |
|-----|------|--------------|
| **Abandoned-cart nudge** | Hourly | WhatsApps unpaid carts 1–12h old a "finish your order" link |
| **Order-acceptance reminder** | Hourly | WhatsApps **you** the list of paid orders you haven't accepted yet (<24h old) until you accept them |
| **Subscriptions autopilot** | 07:00 WIB | Turns each subscription box due today into a normal paid order (adding any "buy 6, get 1 free" cookies), sends **D-2 / D-1 "still in town?"** reminders, and clears stale unpaid plans |
| **Daily owner digest** | 08:00 WIB | WhatsApps **you** yesterday's sales, top sellers, per-store split, rewards redeemed, **low-stock list**, and referral activity |
| **Birthday rewards** | 09:00 WIB | Grants the birthday cookie + sends the birthday message |

The **back-in-stock** alert isn't scheduled — it fires the instant you mark a flavour available.

---

## 8. Delivery & pickup
- **Same-day delivery** via **Lalamove** to Greater Jakarta + Bekasi (live quote at checkout).
- **Intercity next-day** via **Biteship** for addresses outside the same-day zone — the checkout
  checks Biteship coverage and shows courier options + price before paying.
- **Pickup** at your configured pickup points.
- **Tracking** links appear on the order once a shipment is created.

---

## 9. Notifications
- **On a paid order:** you get a **WhatsApp** (Fonnte) **and** an **email** (Resend), plus an **hourly
  reminder** until you **accept** the order in `/admin/orders`.
- **Customers** get an **automatic order-confirmation WhatsApp** when payment succeeds, an optional
  **"on its way + track link"** message you send from the order page, WhatsApp codes for phone
  verification + reward redemption, and the marketing/retention messages above.
- **Subscribers** get an activation confirmation, **D-2 and D-1 reminders** before each box, and a
  confirmation each time a box is made.

---

## 10. Behind the scenes (services)
| Function | Provider |
|----------|----------|
| Payments (QRIS/card) | **Midtrans** |
| Database & login | **Supabase** |
| Same-day delivery | **Lalamove** |
| Intercity shipments & tracking | **Biteship** |
| WhatsApp messages | **Fonnte** |
| Email | **Resend** |
| Hosting (auto-deploys on changes) | **Vercel** |
| Scheduled jobs | **GitHub Actions** |
| Sign in with Google | **Google OAuth** |

---

## 11. Setup & maintenance
- **Admin password** — `ADMIN_BASIC_PASS` in Vercel.
- **Scheduled jobs secret** — a `CRON_SECRET` GitHub Actions repo secret (set to the same value as
  `ADMIN_RETRY_SECRET`) lets the GitHub jobs call the cron endpoints. No Vercel cron is used
  (the Hobby plan only allows daily crons).
- **Database migrations** — SQL files in `web/sql/` are run once in Supabase. All current feature
  migrations have been applied (loyalty, referrals, promos, birthday, back-in-stock, subscriptions,
  order-acceptance, etc.).
- **Reset/verification emails** — for reliable delivery, point Supabase Auth SMTP at Resend.

---

## 12. Subscriptions

Prepaid, repeating cookie boxes. A customer sets it up once, pays for a block of boxes with **one
QRIS payment**, and each box is automatically turned into a normal order on its delivery day.

**Reward — "buy 6, get 1 free":** every 6 cookies received earns 1 free cookie, kept as a **separate
redeemable balance** (NOT the regular buy-10-get-1 loyalty — no double-dipping). The customer
**chooses the flavour** and redeems it either **to their next box** (My Subscription → Redeem 🍪) or
**at checkout / the cafe**. Both paths draw the same balance, so a cookie can never be spent twice.

### For the customer (`/subscribe`)
A short wizard:
1. **Box size** — box of 3 or 6.
2. **What's inside** — *fixed favourites* (pick exactly that many cookies) or *curated surprise*
   (we choose a fresh mix each box). Signed-in members get a **⚡ "Fill my box with favourites"**
   one-tap that builds the box from the cookies they order most.
3. **How often** — weekly, every 2 weeks, or monthly.
4. **Plan length** — prepay **4, 8 or 12 boxes** (one QRIS payment).
5. **Delivery or pickup** — **pickup is free**; **same-day delivery is a flat Rp15.000/box**, prepaid
   with the plan (waived for any box at/above the Rp300.000 free-delivery threshold — today's boxes
   are always under it, so delivery boxes always pay the flat fee).

They must be **signed in** (so the boxes link to their membership & loyalty). The prepaid total is the
normal box price × number of boxes **+ delivery** (no separate subscriber discount; the perk is the
"buy 6, get 1 free" cookies). After paying they get an activation WhatsApp.

### Managing it (`/account` → 🔁 My Subscription)
- **Skip next box** — pushes the next box to the following cycle (no box is lost).
- **Pause / Resume** — stops/restarts deliveries; prepaid boxes are kept.
- **Edit** — change favourites, contents mode, frequency, or delivery address.
- **Add boxes (renew)** — prepay more boxes (4/8/12) with another QRIS.
- **Cancel** — ends it and **refunds unused prepaid boxes** (you settle the refund from admin).

### What happens automatically
- Each morning the **Subscriptions autopilot** (07:00 WIB) makes every box due that day into a normal
  paid order (so it prints, ships, decrements stock and earns loyalty like any order — the bonus
  cookie is free, so it earns nothing), then schedules the next box. When the prepaid boxes run out
  the subscription is marked **completed** (the customer can renew).
- **D-2 and D-1 reminders** WhatsApp the customer to confirm they're in town and details are unchanged.

### For you (`/admin/subscriptions`)
- KPIs (active / due in ≤3 days / **refunds owed** / needs attention).
- **Boxes due in the next 3 days** worklist, and a **reconcile** list (rare "made but no order" cases).
- The full subscription table with prepaid boxes left, next box, and a **Mark refunded** button.
- **Run autopilot now** triggers today's run on demand (otherwise it's the 07:00 job).

---

*Cookie Doh — where the cookie magic happens 🍪*
