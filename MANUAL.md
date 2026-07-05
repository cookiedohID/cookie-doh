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
  The **buyer** stays the customer (gets the receipt/confirmation), the **courier contacts the
  recipient**, and the **"on its way" tracking goes to both the buyer and the recipient** — the
  recipient's copy is surprise-framed ("… is sending you something special …"). (If the recipient
  number matches the buyer's, only one message is sent.) An
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
- **Inbound:** customers who message your WhatsApp get an **instant AI reply** (menu, prices, their
  order status & rewards, etc.), with **hand-off to you** for anything that needs a person — see §13.

---

## 10. Behind the scenes (services)
| Function | Provider |
|----------|----------|
| Payments (QRIS/card) | **Midtrans** |
| Database & login | **Supabase** |
| Same-day delivery | **Lalamove** |
| Intercity shipments & tracking | **Biteship** |
| WhatsApp messages (in & out) | **Fonnte** |
| WhatsApp AI replies | **Claude (Anthropic)** |
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
- **WhatsApp assistant** — set `ANTHROPIC_API_KEY` + `WA_INBOUND_SECRET` in Vercel and point Fonnte's
  incoming webhook at `/api/whatsapp/inbound?key=…` (see §13).

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

## 13. WhatsApp assistant (auto-reply)

When a customer messages your WhatsApp, an **AI assistant answers instantly** — and hands off to you
for anything it can't.

**What it answers** (from the live menu + your policies): the menu and prices, delivery & pickup,
how to order, membership/loyalty, subscriptions, referrals, birthdays, promo codes, and gifts. It can
also look up **that customer's own order status + tracking** and their **reward balance** (only the
number messaging in — never anyone else's).

**Hand-off to you.** For complaints, refunds, changing/cancelling a paid order, wholesale/custom/event
requests, allergy-critical questions, anything it can't answer, or when the customer asks for a person,
it **escalates to you** (you get a WhatsApp with the customer's number, their message and the reason)
and **mutes itself for that chat** so you can take over. It never takes payment or confirms an order in
chat — it points customers to the website.

**Muting the bot for a customer (`/admin` → 💬 WhatsApp chats).** When *you* want to handle someone
yourself, open **WhatsApp chats**, find the conversation and tap **Mute bot** — the bot goes silent for
just that customer (others still get instant replies). Whether muted by you or by a hand-off, it
**auto-resumes once the chat has been quiet for ~2 hours** (each new message while muted rolls that
window forward, so an active back-and-forth stays muted). You can **Unmute** anytime.
*(Note: replies you type on your phone aren't visible to the system — WhatsApp doesn't forward your
outgoing messages — which is why muting is a tap here rather than automatic.)*

It runs on **Claude Haiku** (chosen for low cost on high message volume) and keeps replies short.

### Setup (one-time)
1. **`ANTHROPIC_API_KEY`** in Vercel — an Anthropic API key (pay-as-you-go). Without it, every inbound
   message is simply forwarded to you with a polite holding reply.
2. **`WA_INBOUND_SECRET`** in Vercel — any random string (a shared secret so only Fonnte can post in).
3. In your **Fonnte device dashboard**, set the **incoming/webhook URL** to
   `https://www.cookiedoh.co.id/api/whatsapp/inbound?key=<WA_INBOUND_SECRET>` (needs a Fonnte plan that
   forwards incoming messages). Fonnte's "test webhook" button should show green.

### Editing what it says
- **Menu & prices** stay in sync automatically (same catalog as the website).
- **Opening hours / pickup wording** live at the top of `web/lib/waKnowledge.ts` (the `BUSINESS` block).

---

## 14. VIP tiers

Reward your regulars with escalating perks. A member's tier is worked out **live
from their orders** — no scheduled job, no stored status.

- **Reach** a tier by spending its **annual** amount (rolling **last 12 months**).
- **Keep** it by meeting its **monthly minimum** (this or last calendar month — so a
  quiet 1st-of-month doesn't demote anyone; two quiet months drops them a tier).
- A member sits in the **highest active tier** they currently reach *and* keep.

### Perks (per tier, your choice)
- **Faster loyalty** — instead of buy-10-get-1, a VIP earns at **buy-9 / 8 / 7**.
  (This is retroactive across their history — see the warning below.)
- **Free same-day delivery** — the same-day delivery fee is waived at checkout.
- **A free cookie every order** — the member picks the flavour at checkout.

### Setting it up (`/admin` → 👑 **VIP tiers**)
Each tier has: **name**, **Reach: annual (Rp)**, **Keep: monthly (Rp)** (0 = no
monthly upkeep, kept once reached), **Buy N → 1 free**, and the two perk toggles.
**Save changes**, then **Activate** (new tiers start **paused**). Seeded with a
**Silver / Gold / Platinum** ladder, all paused — edit the numbers and activate
when you're ready.

> ⚠️ **Activating the faster-loyalty perk is retroactive.** Because it recomputes a
> member's whole history at the better rate, turning on e.g. Gold (buy-8) can hand
> a chunk of **free cookies** to existing big spenders straight away. That's the
> intended "welcome to Gold" generosity — just know it's a real cost at the moment
> you activate, not a slow drip.

### Where members see it
- **Account page** — a 👑 tier card with their perks and "spend Rp X more this month
  to keep it" / "Rp Y more to reach the next tier".
- **Cafe POS** — a 👑 tier chip in the member banner; stamps show the faster rate.
- **Checkout** — free delivery shown as **Free 👑**, and the free-cookie picker.

Nothing shows to customers until you activate at least one tier.

---

## 15. Production plan

`/admin` → 🧑‍🍳 **Production plan** tells you **how many recipes to bake**, from your
live stock + recent sales — so you bake what's actually selling and don't run out.

- **Two bases:** 🌑 dark and 🌕 light. **1 recipe = 11 cookies** of a base; the smallest
  batch is **½ a recipe per flavour**.
- For each flavour: expected demand = (its sales/day over the chosen window) ×
  the coverage days; subtract current stock (all locations) → what's short →
  rounded up to the next ½-recipe. Out-of-stock sellers are flagged.
- The headline shows the total, e.g. *"1 dark + 1½ light = 2½ recipes,"* with a
  per-flavour breakdown so you know how to split each base batch.
- **Adjust** "bake to cover" (7 / 14 / 30 days) and the sales window (last 14 / 28 /
  56 days) at the top — it recalculates instantly.
- A flavour sold as a **smoothie** isn't counted here — only cookies.

**Bake it → add to inventory.** The plan is a starting point, not a lock:

- Every flavour has an editable **"Make 🍪"** box, pre-filled with the suggestion
  (in *cookies* — ½ recipe ≈ 6 cookies). **Change any number** to whatever you
  actually baked; the per-base "Making X cookies ≈ Y recipes" line updates live.
- Pick **which location** the baked cookies go to (top-right dropdown; defaults to
  **Kemang**, your kitchen).
- Hit **✓ Add to inventory** — it adds each flavour's cookies to that location's
  stock, clears any "sold out" flag on them, and logs the batch for the reports
  history. The plan then reloads: stock is higher and those flavours drop off the
  "need to bake" list. (Nothing is added until you press the button and confirm.)
- **Back-in-stock alerts** toggle (top): when **On** (default), if a bake brings back
  a flavour that was sold out at *every* location, everyone who tapped "notify me"
  gets a WhatsApp. Flip it **Off** for a quiet restock. It only messages flavours
  that were truly sold out storefront-wide and had people waiting — so most bakes
  send nothing; the success line tells you if anyone was alerted.

*(Base mapping lives in `web/lib/production.ts`. "Crimson Crush" isn't in the
catalogue yet — add it to the flavours + that file's base map when it exists.)*

---

## 16. Install the admin as a phone app

The whole back-office runs as an installable app — no App Store needed.

- **iPhone (Safari):** open `cookiedoh.co.id/admin`, tap **Share** → **Add to Home
  Screen**. It appears as **CD Admin** and opens full-screen, like a native app.
- **Android (Chrome):** open `/admin`, tap the **⋮** menu → **Install app** (or
  "Add to Home screen").
- Log in once; the session lasts 30 days. It auto-updates whenever we deploy.
- The **cafe register** (`/cafe`) installs the same way as its own **Cafe POS** app.

*(PWA manifests: `web/public/backoffice.webmanifest` for admin, `cafe.webmanifest`
for the register. Admin's lives at a non-`/admin` path so the login gate doesn't
block it.)*

---

*Cookie Doh — where the cookie magic happens 🍪*

---

## 17. TotalBuahStore shop tab (NOT LAUNCHED — owner preview only)

A second storefront on cookiedoh.co.id selling TBS groceries, in full TBS brand
(red/green + cherry + "100% Fresh. Today and Always"). Hidden from customers
until launch: only a logged-in **admin** sees the "TotalBuahStore" nav tab and
`/tbs` (a "coming soon" page shows for everyone else).

- **Preview it:** log in at `/admin/login` on your phone, then open `/tbs`.
- **Store first:** the customer picks their TBS store (RC Veteran / Karang
  Tengah / Bekasi); prices + live stock + fulfilment all come from that store.
- **Catalog:** only the SKUs making **80% of revenue per category** (~1,870
  products, 21 categories, recomputable as sales shift). Per-kg produce is sold
  as fixed **±1kg packs**. Search + category chips + basket built in.
- **Stock:** live per store once the ERP's stock feed is loaded; until then
  items show as orderable with a "stock syncing" note.
- **Product pages:** tap any product → its own page (kurly.com-style): price,
  ±1kg pack info, **availability at all 3 stores** (yours highlighted), product
  facts, and related items from the same category.
- **Launch:** Admin → **🍒 TBS** → tap **🚀 Open shop to everyone** (takes effect
  within seconds; the same button closes it back to password preview).
- **Product pages:** every product opens its own page — see above.
- **Checkout (`/tbs/checkout`):** pickup at the chosen store or delivery
  (fee by distance from that store, base Rp10k + Rp2.5k/km, max 12 km — tune in
  `web/lib/tbsShop.ts`). Pays by QRIS/card via the same Midtrans as Cookie Doh.
  **All prices are re-checked server-side against the live store data** at pay
  time — the browser can never set its own prices, and oversells are blocked.
- **After payment:** the order is pushed automatically to the TBS back-office
  ("Sales → Web Orders"), where store staff confirm → prepare → complete. The
  customer gets the standard WhatsApp confirmations; the order also appears in
  `/admin/orders` and the customer's own order history.
- **💰 Marketplace model (separate books):** Cookie Doh is TBS's marketplace
  and charges TBS a **fee (default 5%) on the TBS goods value** (never on
  delivery — that's courier money). Cookie Doh books the fee as revenue;
  TBS books it as an expense. Change it anytime in
  **Admin → Reports → TBS settlement section**: type a new **Fee %** and tap
  **💾 Save as default** — every report and Tukar Faktur uses it from then on
  (the box alone + Apply only previews without saving).
- **🎛 TBS admin hub (Admin → 🍒 TBS):** the one screen to run the shop —
  open/close the shop, this-month money + fee, marketplace-fee setting,
  live store health, and every TBS order with its back-office push status
  (a failed hand-off shows a **Retry push** button; pushing twice is safe).
- **📊 TBS sales reports (Admin → Reports → 🍒 TBS tab):** per **store per day**
  summary (orders / goods / delivery / fee / net owed) with totals, plus the
  per-order detail underneath. Both download as CSV (**Summary CSV** /
  **Detail CSV**). Dates are WIB business days.
- **🧾 Tukar Faktur Cabang (monthly settlement invoice):** from the TBS tab,
  tap a store's **TFC button** (or open `/admin/tbs-tf`), pick the month, and
  **Generate**. You get a numbered document (e.g. `TFC-XMAS-202607`) listing
  every order, the gross owed to the store, the marketplace fee, and the
  **NET PAYABLE TO STORE** — with signature lines. **Print / Save PDF** and
  send it; the TBS side books it through the back-office AP. Regenerating the
  same closed month always gives the same numbers.
- **Monthly routine:** 1st of the month → Reports → 🍒 TBS tab → set last
  month's dates → download the CSVs → generate each store's Tukar Faktur →
  transfer each store its NET amount.
- **Refunds/cancels:** handled on the Cookie Doh side (the money lives in your
  Midtrans); the store cancels its copy in Web Orders.
- **📦 Customer order tracking:** My Orders has Shopee-style stage tabs
  (To pay / Being prepared / Ready / Completed) fed LIVE from each store's
  Web Orders queue; tapping an order opens the detail page (timeline, items,
  payment method, order no + copy, WhatsApp help, **Buy again**).
- **👥 One member base:** Cookie Doh and TBS share members by phone —
  website signups and paid orders auto-register in TBS; till signups sync
  back hourly. Points post when the store completes the order and appear in
  the customer's Family page (balance + per-receipt points).
- **🎛 Loyalty settings & reports:** earn % of margin = back-office →
  Sales → Web Shop; the calculation trail + per-store points reports =
  SmartList → POS (Points ledger / by store / flow map / inter-store debt /
  Points given Detail·Header·Summary). Daily WhatsApp digest includes a TBS
  line (orders · goods · fee earned).

*(Data flows server-to-server from the TBS ERP's partner API — same token as
the Member-page TBS rewards tab.)*
