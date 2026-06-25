// web/app/help/page.tsx — customer-facing help & FAQ. Public.
import type { Metadata } from "next";
import Link from "next/link";
import { COLORS } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Help & FAQ — Cookie Doh",
  description: "How ordering, membership, rewards, referrals, birthdays, promo codes, and delivery work at Cookie Doh.",
};

const card: React.CSSProperties = { background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 18, marginTop: 14 };
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 900, color: COLORS.black, margin: "0 0 8px" };
const q: React.CSSProperties = { fontSize: 15, fontWeight: 800, color: COLORS.black, margin: "12px 0 2px" };
const a: React.CSSProperties = { color: "#333", fontSize: 14, lineHeight: 1.65, margin: "2px 0" };

function QA({ q: question, children }: { q: string; children: React.ReactNode }) {
  return (
    <>
      <div style={q}>{question}</div>
      <p style={a}>{children}</p>
    </>
  );
}

export default function HelpPage() {
  return (
    <main style={{ minHeight: "100vh", background: COLORS.sand }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 18px 90px" }}>
        <span className="font-dearjoe" style={{ fontSize: 22, color: COLORS.blue }}>cookie doh</span>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: COLORS.black, margin: "2px 0 0" }}>Help &amp; FAQ</h1>
        <p style={{ color: COLORS.muted, fontSize: 14, marginTop: 6 }}>Everything you need to know about ordering and rewards 🍪</p>

        <section style={card}>
          <h2 style={h2}>🍪 Ordering</h2>
          <QA q="How do I order?">
            Go to <Link href="/build" style={{ color: COLORS.blue, fontWeight: 700 }}>Build a Box</Link>, choose a Box of 3 or
            Box of 6, mix and match your flavours, then check out. You can also add ready-made <Link href="/assortments" style={{ color: COLORS.blue, fontWeight: 700 }}>assortments</Link>,
            <Link href="/bundles" style={{ color: COLORS.blue, fontWeight: 700 }}> bundles</Link>, and <Link href="/smoothies" style={{ color: COLORS.blue, fontWeight: 700 }}>smoothies</Link>.
          </QA>
          <QA q="How much is a box?">Rp30,000 per cookie in a box — Box of 3 is Rp90,000, Box of 6 is Rp180,000.</QA>
          <QA q="How do I pay?">Securely by QRIS or card at checkout. Your order is confirmed the moment payment goes through.</QA>
        </section>

        <section style={card}>
          <h2 style={h2}>🚚 Delivery &amp; pickup</h2>
          <QA q="Where do you deliver?">
            <b>Same-day</b> across Greater Jakarta + Bekasi, and <b>next-day intercity</b> to addresses further out
            (checkout shows courier options and the price before you pay). You can also choose <b>pickup</b> at one of our points.
          </QA>
          <QA q="Can I track my order?">Yes — a tracking link appears on your order once it ships, and you can see everything in your account.</QA>
        </section>

        <section style={card}>
          <h2 style={h2}>⭐ Membership &amp; rewards</h2>
          <QA q="How does loyalty work?">
            Buy <b>10 cookies → get 1 free</b>, and <b>10 drinks → get 1 free</b> (counted separately). Single cookies/drinks,
            boxes, assortments, and bundles all earn stamps. Your progress never resets.
          </QA>
          <QA q="How do I become a member?">
            Sign up at <Link href="/account" style={{ color: COLORS.blue, fontWeight: 700 }}>your account</Link> with email or
            Google. Your phone number is your membership ID (we send a quick code on WhatsApp to verify it).
          </QA>
          <QA q="How do I use a free cookie?">
            In-store, show your membership QR and ask staff to redeem — we'll send a confirmation code to your WhatsApp. Online,
            your free rewards appear at checkout. Free rewards come from paid orders.
          </QA>
        </section>

        <section style={card}>
          <h2 style={h2}>🔁 Subscriptions</h2>
          <QA q="What is a Cookie Doh subscription?">
            Cookies on repeat. Pick a box of 3 or 6, choose <b>fixed favourites</b> or a <b>curated surprise</b>, and how
            often you want it (weekly, every 2 weeks, or monthly). Prepay a plan of <b>4, 8 or 12 boxes</b> in one payment and
            you earn <b>free cookies — buy 6, get 1 free</b>, saved as a redeemable balance you can spend on any flavour
            (redeem to your next box, or at checkout / the cafe). Start at{" "}
            <Link href="/subscribe" style={{ color: COLORS.blue, fontWeight: 700 }}>/subscribe</Link>.
          </QA>
          <QA q="Do I have to pick my cookies one by one?">
            If you're signed in, the “fixed favourites” step shows <b>⚡ Your usuals</b> — tap <b>Fill my box with
            favourites</b> and we'll build the box from the cookies you order most. You can still tweak it after.
          </QA>
          <QA q="Can I skip, pause or change it?">
            Anytime, from <Link href="/account/subscription" style={{ color: COLORS.blue, fontWeight: 700 }}>My Subscription</Link>:
            skip the next box, pause/resume, edit your cookies, frequency or address, add more boxes, or cancel.
          </QA>
          <QA q="Is delivery free?">
            <b>Pickup is free.</b> <b>Same-day delivery is a flat Rp15.000 per box</b>, prepaid with your plan — so the
            price never changes between boxes. (Your plan total already includes it.)
          </QA>
          <QA q="What if I'm away on a delivery day?">
            We WhatsApp you <b>2 days and 1 day before</b> every box to confirm you're in town. If anything's changed, just skip
            or reschedule that box from My Subscription.
          </QA>
          <QA q="What happens if I cancel?">
            Your subscription ends and any <b>unused prepaid boxes are refunded</b>. Boxes already made aren't refundable.
          </QA>
        </section>

        <section style={card}>
          <h2 style={h2}>🎁 Referrals, birthdays &amp; codes</h2>
          <QA q="How do referrals work?">
            Share your personal link from your account. When a friend places their <b>first</b> order (a box of 6 or more) using
            it, <b>you both get a free cookie</b> 🍪
          </QA>
          <QA q="Do I get anything on my birthday?">
            Yes! Add your birthday (month + day) in your account and we'll surprise you with a free cookie every year.
            You can only <b>set it once</b> (it locks after saving), so double-check the date — message us if it needs fixing.
          </QA>
          <QA q="How do I use a promo code?">Enter it in the “Promo code” box at checkout and tap Apply — the discount shows before you pay.</QA>
          <QA q="A flavour I want is sold out.">
            Tap <b>“🔔 Notify me when back”</b> on that flavour and leave your number — we'll WhatsApp you the moment it returns.
          </QA>
        </section>

        <section style={card}>
          <h2 style={h2}>💌 Gifts &amp; account</h2>
          <QA q="Can I send a box to someone else?">
            Yes — at checkout (delivery), tick <b>“Delivering to someone else?”</b> and add their name + WhatsApp.
            <b>You both</b> get the tracking link (theirs says it's a surprise from you) and the courier contacts them. If they're not a
            customer yet, you can invite them with your referral link so you <b>both</b> get a free cookie on their first box.
          </QA>
          <QA q="Can I send a box as a gift?">
            Yes — toggle <b>“Send as a gift”</b> at checkout to add a handwritten card (To / From / message). We leave prices off the box.
          </QA>
          <QA q="Where do I see my past orders?">
            In <Link href="/account/orders" style={{ color: COLORS.blue, fontWeight: 700 }}>My Orders</Link> — with pickup/delivery
            details, dates, and any gift notes. You can save multiple addresses too.
          </QA>
        </section>

        <section style={card}>
          <h2 style={h2}>💬 Still need help?</h2>
          <p style={a}>Message us on WhatsApp (the button in the corner of the site) — our assistant replies
            instantly to common questions (menu, prices, your order status, rewards), and a teammate steps
            in for anything else.</p>
        </section>

        <p style={{ color: COLORS.muted, fontSize: 12, marginTop: 18, textAlign: "center" }}>
          Cookie Doh — where the cookie magic happens 🍪
        </p>
      </div>
    </main>
  );
}
