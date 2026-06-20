"use client";

// web/app/admin/help/page.tsx — operating manual for Cookie Doh. Admin-gated.
import { COLORS } from "@/lib/theme";

const card: React.CSSProperties = { background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 18, marginTop: 14 };
const h2: React.CSSProperties = { fontSize: 19, fontWeight: 900, color: COLORS.black, margin: "0 0 4px" };
const h3: React.CSSProperties = { fontSize: 15, fontWeight: 800, color: COLORS.black, margin: "12px 0 4px" };
const p: React.CSSProperties = { color: "#333", fontSize: 14, lineHeight: 1.6, margin: "4px 0" };
const li: React.CSSProperties = { color: "#333", fontSize: 14, lineHeight: 1.6, marginBottom: 4 };
const code: React.CSSProperties = { background: "rgba(0,20,167,0.08)", color: COLORS.blue, padding: "1px 6px", borderRadius: 6, fontFamily: "monospace", fontSize: 13 };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={card}>
      <h2 style={h2}>{title}</h2>
      {children}
    </section>
  );
}

export default function AdminHelpPage() {
  return (
    <main style={{ minHeight: "100vh", background: COLORS.sand }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 18px 90px" }}>
        <span className="font-dearjoe" style={{ fontSize: 22, color: COLORS.blue }}>cookie doh</span>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: COLORS.black, margin: "2px 0 0" }}>Operating Manual</h1>
        <p style={{ color: COLORS.muted, fontSize: 13, marginTop: 4 }}>How everything works — for you and your staff.</p>

        <Section title="🔗 The three places">
          <ul style={{ paddingLeft: 18 }}>
            <li style={li}><b>Storefront</b> — <span style={code}>cookiedoh.co.id</span> — where customers browse and order.</li>
            <li style={li}><b>Admin</b> — <span style={code}>cookiedoh.co.id/admin</span> — your back office (password-protected).</li>
            <li style={li}><b>Cafe POS</b> — <span style={code}>cookiedoh.co.id/cafe</span> — the in-store register / self-order kiosk.</li>
          </ul>
        </Section>

        <Section title="🛒 What customers do (storefront)">
          <ul style={{ paddingLeft: 18 }}>
            <li style={li}><b>Build a box</b> — pick a Box of 3 or Box of 6 and choose flavours (Rp30,000/cookie in a box).</li>
            <li style={li}><b>Assortments</b> — ready-made curated boxes, one tap.</li>
            <li style={li}><b>Bundles</b> — fixed-price sets of cookies + drinks.</li>
            <li style={li}><b>Smoothies</b> — drinks.</li>
            <li style={li}><b>Checkout</b> — choose <b>delivery</b> (same-day or intercity next-day) or <b>pickup</b>, pick a date/time, pay by QRIS/card (Midtrans).</li>
            <li style={li}><b>🎁 Gift</b> — a checkout toggle adds a handwritten card (To / From / message) and leaves prices off the box.</li>
            <li style={li}><b>🎟️ Promo code</b> — customers enter a code to get a discount; members can also <b>redeem free rewards</b> online.</li>
          </ul>
          <h3 style={h3}>Membership &amp; loyalty</h3>
          <ul style={{ paddingLeft: 18 }}>
            <li style={li}>Customers sign up with email or Google; their <b>phone number is their member ID</b> (verified by a WhatsApp code).</li>
            <li style={li}>Their account shows a <b>QR code</b>, loyalty progress, <b>My Orders</b>, and <b>saved addresses</b>.</li>
            <li style={li}>Forgot password? There's a reset link on the login page.</li>
          </ul>
        </Section>

        <Section title="🍪 Loyalty rules (how stamps work)">
          <ul style={{ paddingLeft: 18 }}>
            <li style={li}>Buy <b>10 cookies → 1 free cookie</b>; buy <b>10 drinks → 1 free drink</b>. Cookies and drinks are tracked separately.</li>
            <li style={li}><b>What earns stamps:</b> single cookies/drinks, boxes, and assortments.</li>
            <li style={li}><b>What doesn't:</b> bundles, free reward items, and other promos.</li>
            <li style={li}>Progress never resets — leftovers roll forward (12 cookies = 1 free + 2 toward the next).</li>
            <li style={li}><b>Bonus free cookies</b> from referrals and birthdays show in the same balance and redeem the same way.</li>
          </ul>
        </Section>

        <Section title="🧾 Admin — Orders">
          <ul style={{ paddingLeft: 18 }}>
            <li style={li}>See every order (cafe + online). Click a row to open the full detail (customer name, phone, address, items, gift card).</li>
            <li style={li}>Mark <b>Paid / Sending / Sent</b>, book Lalamove, send a WhatsApp update, view tracking.</li>
            <li style={li}><b>🗑 Delete</b> a single order, or <b>Delete all unpaid</b> to clear test/abandoned orders (paid orders are never touched).</li>
          </ul>
        </Section>

        <Section title="📦 Admin — Inventory">
          <p style={p}>At <span style={code}>/admin/flavors</span> (or <span style={code}>/admin/inventory</span>):</p>
          <ul style={{ paddingLeft: 18 }}>
            <li style={li}>Set <b>stock numbers per location</b>, or mark an item <b>sold out</b> at a location.</li>
            <li style={li}>An item with <b>no number</b> = unlimited (never sells out). Type a number to start tracking it.</li>
            <li style={li}>An item shows as sold out if it's flagged sold-out <i>or</i> its stock hits 0.</li>
          </ul>
        </Section>

        <Section title="📍 Admin — Locations &amp; transfer">
          <ul style={{ paddingLeft: 18 }}>
            <li style={li}><b>Add / edit stores</b> (name, short label, address).</li>
            <li style={li}><b>🔄 Internal transfer</b> — move an item's stock from one store to another. The counts update and it's logged.</li>
            <li style={li}>Transferring stock into a store automatically clears its "sold out" flag.</li>
            <li style={li}>New locations are inventory/transfer points — delivery still ships from your existing stores.</li>
          </ul>
        </Section>

        <Section title="📊 Admin — Reports">
          <ul style={{ paddingLeft: 18 }}>
            <li style={li}><b>Daily sales</b> — revenue + order count per day. <b>Click a date</b> to expand its orders; click an order to open its detail.</li>
            <li style={li}><b>By item</b> — quantities sold and revenue per item.</li>
            <li style={li}><b>Locations</b> — compare sales across your stores.</li>
            <li style={li}><b>Inventory</b> — current stock + a movement history (sales + transfers).</li>
            <li style={li}><b>Redeemed</b> — free items actually given out.</li>
            <li style={li}>Filter by date range and location at the top.</li>
          </ul>
        </Section>

        <Section title="📣 Admin — Broadcast">
          <p style={p}>At <span style={code}>/admin/broadcast</span> — send a WhatsApp to a group of customers.</p>
          <ul style={{ paddingLeft: 18 }}>
            <li style={li}>Pick a <b>segment</b>: Everyone (all who've ordered + members), Active (30 days), Lapsed (45+ days), or VIPs (3+ orders / Rp300k+). The recipient count updates live.</li>
            <li style={li}>Type <span style={code}>{"{name}"}</span> to personalise. A "Reply STOP to opt out" line is added automatically.</li>
            <li style={li}>Each message costs a little — only message people who expect to hear from you.</li>
          </ul>
        </Section>

        <Section title="🎟️ Admin — Promo codes">
          <p style={p}>At <span style={code}>/admin/promos</span> — create discount codes customers enter at checkout.</p>
          <ul style={{ paddingLeft: 18 }}>
            <li style={li}><b>Percent</b> or <b>fixed amount</b> off, with optional <b>min spend</b>, <b>max-discount cap</b> (for percent), <b>total uses</b>, <b>uses per customer</b>, and <b>expiry</b>.</li>
            <li style={li}><b>Pause</b> or <b>Delete</b> any code; usage is shown next to each.</li>
            <li style={li}>The discount is recalculated on our server (the browser can't fake it). Pair a code with a Broadcast for a campaign.</li>
          </ul>
        </Section>

        <Section title="💛 Growth &amp; retention (automatic)">
          <h3 style={h3}>Referrals — give a cookie, get a cookie</h3>
          <p style={p}>Members have a "Refer a friend" link in their account. When a <b>new</b> customer orders their <b>first box of 6+</b> with that link, <b>both</b> get a free cookie (a refund of that order reverses it). The daily digest flags unusual referral activity.</p>
          <h3 style={h3}>Birthday rewards</h3>
          <p style={p}>Members set a month + day in their account; each morning the system grants a free birthday cookie and sends a birthday WhatsApp.</p>
          <h3 style={h3}>Back-in-stock alerts</h3>
          <p style={p}>On a sold-out flavour, customers tap "Notify me when back". When you mark that flavour available again in <b>Inventory</b>, everyone subscribed gets a WhatsApp.</p>
        </Section>

        <Section title="⏰ Things that run automatically">
          <ul style={{ paddingLeft: 18 }}>
            <li style={li}><b>Abandoned-cart nudge</b> (hourly) — unpaid carts 1–12h old get one WhatsApp with a link to finish paying.</li>
            <li style={li}><b>Daily digest</b> (08:00) — <b>you</b> get a WhatsApp with yesterday's sales, top sellers, per-store split, rewards redeemed, a <b>low-stock list</b>, and referral activity.</li>
            <li style={li}><b>Birthday rewards</b> (09:00) — grants the cookie + sends the birthday message.</li>
          </ul>
        </Section>

        <Section title="🏪 Cafe POS (in-store)">
          <p style={p}>Open <span style={code}>/cafe</span> on the register/tablet. It's a full-screen kiosk — the storefront nav is hidden.</p>
          <ul style={{ paddingLeft: 18 }}>
            <li style={li}>Tap items to add (singles, boxes, bundles, assortments). A nudge appears if a customer has 3+ singles, suggesting a cheaper box.</li>
            <li style={li}><b>Members:</b> scan their QR (📷) or type their phone. A big <b>"Welcome, [name]"</b> banner shows — so a walk-in notices if it isn't them. "Not you? ✕" detaches it. It clears after every order.</li>
            <li style={li}><b>Redeeming free rewards:</b> tap "Use free cookie/drink" → the member gets a code on <b>their own WhatsApp</b> → they read it to you → enter it to confirm. (Stops staff redeeming without the member.)</li>
            <li style={li}>Charge by QRIS; on payment it prints and returns to the start screen.</li>
          </ul>
        </Section>

        <Section title="🚚 Delivery &amp; pickup">
          <ul style={{ paddingLeft: 18 }}>
            <li style={li}><b>Same-day delivery</b> via Lalamove to the Greater Jakarta + Bekasi service area (the address field checks coverage).</li>
            <li style={li}><b>Intercity next-day</b> via Biteship for addresses outside the same-day zone — the checkout shows courier options + price before paying.</li>
            <li style={li}><b>Pickup</b> at your configured points.</li>
            <li style={li}>Tracking links appear on the order once a shipment is created.</li>
          </ul>
        </Section>

        <Section title="🔔 Notifications">
          <ul style={{ paddingLeft: 18 }}>
            <li style={li}>On a paid order you get a WhatsApp alert (Fonnte) + email (Resend).</li>
            <li style={li}>Customers get WhatsApp updates and order confirmations.</li>
          </ul>
        </Section>

        <Section title="🛠 Behind the scenes (who does what)">
          <ul style={{ paddingLeft: 18 }}>
            <li style={li}><b>Payments</b> — Midtrans (QRIS/card).</li>
            <li style={li}><b>Database &amp; login</b> — Supabase.</li>
            <li style={li}><b>Delivery</b> — Lalamove (same-day) + Biteship (shipments/tracking).</li>
            <li style={li}><b>WhatsApp</b> — Fonnte. <b>Email</b> — Resend.</li>
            <li style={li}><b>Hosting</b> — Vercel (the site redeploys automatically when changes are pushed).</li>
          </ul>
        </Section>

        <Section title="❓ Common questions">
          <h3 style={h3}>How do I clear test orders?</h3>
          <p style={p}>Admin → Orders → <b>🗑 Delete all unpaid</b>.</p>
          <h3 style={h3}>An item ran out at one store but I have stock elsewhere.</h3>
          <p style={p}>Admin → Locations → <b>Internal transfer</b>. (Transferring in also un-marks "sold out".)</p>
          <h3 style={h3}>How do I see a customer's history?</h3>
          <p style={p}>Admin → Customers (search by name), or open any order for that customer.</p>
          <h3 style={h3}>How do I run a discount campaign?</h3>
          <p style={p}>Admin → <b>Promo codes</b> → create a code, then Admin → <b>Broadcast</b> → message a segment telling them to use it.</p>
          <h3 style={h3}>A flavour is back in stock — how do I tell people?</h3>
          <p style={p}>Just flip it to available in Admin → <b>Inventory</b>. Everyone who tapped "Notify me" is WhatsApped automatically.</p>
          <h3 style={h3}>How do I log out of admin?</h3>
          <p style={p}>The <b>Log out</b> button is in the top-right of the admin header.</p>
        </Section>

        <p style={{ color: COLORS.muted, fontSize: 12, marginTop: 18, textAlign: "center" }}>
          Cookie Doh — where the cookie magic happens 🍪
        </p>
      </div>
    </main>
  );
}
