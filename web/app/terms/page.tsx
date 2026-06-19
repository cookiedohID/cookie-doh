// web/app/terms/page.tsx — Terms of Service
// NOTE: Starter template tailored to Cookie Doh. The owner should review the
// CANCELLATIONS & REFUNDS and CONTACT sections (and ideally have a professional
// check it) before relying on it legally.
import { COLORS } from "@/lib/theme";

export const metadata = {
  title: "Terms of Service — Cookie Doh",
  description: "The terms for ordering from Cookie Doh.",
};

const SUPPORT_EMAIL = "hello@cookiedoh.co.id"; // ← owner: confirm your support email

const sec: React.CSSProperties = { marginTop: 26 };
const h2: React.CSSProperties = { fontSize: 19, fontWeight: 800, color: COLORS.black, margin: "0 0 8px" };
const p: React.CSSProperties = { color: "#333", lineHeight: 1.65, fontSize: 15, margin: "0 0 10px" };

export default function TermsPage() {
  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 18px 80px" }}>
        <span className="font-dearjoe" style={{ fontSize: 22, color: COLORS.blue }}>cookie doh</span>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: COLORS.black, margin: "4px 0 4px" }}>Terms of Service</h1>
        <p style={{ color: COLORS.muted, fontSize: 13 }}>Last updated: 19 June 2026</p>

        <section style={sec}>
          <p style={p}>
            Welcome to Cookie Doh. By ordering from <strong>cookiedoh.co.id</strong> or using our website,
            you agree to these Terms.
          </p>
        </section>

        <section style={sec}>
          <h2 style={h2}>Our products &amp; prices</h2>
          <p style={p}>
            We sell freshly made cookies and drinks. Prices are shown in Indonesian Rupiah (IDR) and may change
            without notice. Items are subject to availability.
          </p>
        </section>

        <section style={sec}>
          <h2 style={h2}>Orders &amp; payment</h2>
          <p style={p}>
            You place an order through our website or in-store. Payment is processed securely by a trusted
            third-party payment provider. Your order is confirmed once payment is received. We may decline or cancel an order (for example, if an
            item is unavailable or we cannot deliver to your area), and will refund any payment for a cancelled order.
          </p>
        </section>

        <section style={sec}>
          <h2 style={h2}>Delivery &amp; pickup</h2>
          <p style={p}>
            We deliver through trusted third-party courier partners to supported areas, or you can pick up
            at one of our locations. Delivery times and fees are estimates and may vary with distance, demand, and
            courier availability.
          </p>
        </section>

        <section style={sec}>
          <h2 style={h2}>⚠️ Allergens</h2>
          <p style={p}>
            Our products are made in a kitchen that also handles <strong>wheat (gluten), dairy, eggs, tree nuts,
            peanuts, and soy</strong>. We cannot guarantee any product is free from these allergens. If you have a
            food allergy, please order at your own discretion and contact us with any questions.
          </p>
        </section>

        <section style={sec}>
          <h2 style={h2}>Cancellations &amp; refunds</h2>
          <p style={p}>
            Because our products are freshly made and perishable, we accept cancellations only before we begin
            preparing your order. If something is wrong with your order, please contact us promptly and we&apos;ll
            make it right. {/* ← owner: confirm your exact refund/replacement policy here. */}
          </p>
        </section>

        <section style={sec}>
          <h2 style={h2}>Membership &amp; loyalty rewards</h2>
          <p style={p}>
            Members earn one free cookie for every 10 cookies purchased, and one free drink for every 10 drinks.
            Single cookies and drinks, boxes, and assortments all count toward stamps. Bundles, free reward items,
            and other promotional items do not earn stamps. Rewards have no cash value, are non-transferable, and
            may expire or change. We may update or end the program at any time.
          </p>
        </section>

        <section style={sec}>
          <h2 style={h2}>Your account</h2>
          <p style={p}>
            Keep your login details secure. You are responsible for activity under your account. Your phone number
            is your membership ID and is verified by a one-time code sent via WhatsApp.
          </p>
        </section>

        <section style={sec}>
          <h2 style={h2}>Our content</h2>
          <p style={p}>
            The Cookie Doh name, logo, recipes, photos, and website content belong to us and may not be used without
            our permission.
          </p>
        </section>

        <section style={sec}>
          <h2 style={h2}>Liability</h2>
          <p style={p}>
            To the extent permitted by law, Cookie Doh is not liable for indirect or consequential losses arising
            from your use of our service. Nothing in these Terms limits liability that cannot be limited by law.
          </p>
        </section>

        <section style={sec}>
          <h2 style={h2}>Governing law</h2>
          <p style={p}>These Terms are governed by the laws of the Republic of Indonesia.</p>
        </section>

        <section style={sec}>
          <h2 style={h2}>Contact us</h2>
          <p style={p}>Questions? Email us at <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: COLORS.blue, fontWeight: 700 }}>{SUPPORT_EMAIL}</a>.</p>
        </section>
      </div>
    </main>
  );
}
