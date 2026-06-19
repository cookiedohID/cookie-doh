// web/app/privacy/page.tsx — Privacy Policy
// NOTE: Starter template tailored to Cookie Doh's stack. Review the items marked
// for the owner (contact details, retention period) and have a professional check
// it before relying on it legally.
import { COLORS } from "@/lib/theme";

export const metadata = {
  title: "Privacy Policy — Cookie Doh",
  description: "How Cookie Doh collects, uses, and protects your information.",
};

const SUPPORT_EMAIL = "hello@cookiedoh.co.id"; // ← owner: confirm your support email

const sec: React.CSSProperties = { marginTop: 26 };
const h2: React.CSSProperties = { fontSize: 19, fontWeight: 800, color: COLORS.black, margin: "0 0 8px" };
const p: React.CSSProperties = { color: "#333", lineHeight: 1.65, fontSize: 15, margin: "0 0 10px" };
const li: React.CSSProperties = { color: "#333", lineHeight: 1.6, fontSize: 15, marginBottom: 6 };

export default function PrivacyPage() {
  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 18px 80px" }}>
        <span className="font-dearjoe" style={{ fontSize: 22, color: COLORS.blue }}>cookie doh</span>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: COLORS.black, margin: "4px 0 4px" }}>Privacy Policy</h1>
        <p style={{ color: COLORS.muted, fontSize: 13 }}>Last updated: 19 June 2026</p>

        <section style={sec}>
          <p style={p}>
            This Privacy Policy explains how Cookie Doh (&quot;we&quot;, &quot;us&quot;), which operates{" "}
            <strong>cookiedoh.co.id</strong>, collects, uses, and protects your information when you order
            from us, create a membership, or use our website. By using our site you agree to this policy.
          </p>
        </section>

        <section style={sec}>
          <h2 style={h2}>Information we collect</h2>
          <ul style={{ paddingLeft: 20 }}>
            <li style={li}><strong>Order details</strong> — your name, phone number, email, delivery address, and the items you order.</li>
            <li style={li}><strong>Membership &amp; loyalty</strong> — your phone number (your member ID), name, and reward/stamp history.</li>
            <li style={li}><strong>Account sign-in</strong> — if you sign in with Google, we receive your name and email from Google; if you use email sign-in, your email address.</li>
            <li style={li}><strong>Payment</strong> — payments are processed by a secure third-party payment provider. We do <strong>not</strong> collect or store your card or bank details.</li>
            <li style={li}><strong>Device data</strong> — your browser stores your cart locally on your device.</li>
          </ul>
        </section>

        <section style={sec}>
          <h2 style={h2}>How we use your information</h2>
          <ul style={{ paddingLeft: 20 }}>
            <li style={li}>To take, prepare, and deliver or hand over your order.</li>
            <li style={li}>To run your membership and apply your loyalty rewards.</li>
            <li style={li}>To send you order updates and confirmations (via WhatsApp and email).</li>
            <li style={li}>To provide customer support and improve our products and service.</li>
            <li style={li}>To meet legal, tax, and accounting obligations.</li>
          </ul>
        </section>

        <section style={sec}>
          <h2 style={h2}>Service providers we share data with</h2>
          <p style={p}>To run our service, we share only the information needed with trusted third-party providers acting on our behalf. These fall into the following categories:</p>
          <ul style={{ paddingLeft: 20 }}>
            <li style={li}><strong>Payment processing</strong> — to take your payment securely. We never see or store your card or bank details.</li>
            <li style={li}><strong>Hosting, database &amp; sign-in</strong> — to run our website, store your data securely, and manage your account login (including the optional &quot;Sign in with Google&quot;).</li>
            <li style={li}><strong>Notifications</strong> — to send order updates by WhatsApp and email.</li>
            <li style={li}><strong>Delivery &amp; logistics</strong> — to deliver your order and provide shipment tracking.</li>
          </ul>
          <p style={p}>These providers may use your information only to provide their service to us, not for their own purposes. We do not sell your personal information.</p>
        </section>

        <section style={sec}>
          <h2 style={h2}>How long we keep it</h2>
          <p style={p}>
            We keep your account and order information for as long as your account is active and as needed to
            fulfil orders, run the loyalty program, and meet our legal and accounting obligations. You can ask
            us to delete your account at any time.
          </p>
        </section>

        <section style={sec}>
          <h2 style={h2}>Your choices</h2>
          <p style={p}>
            You may ask us to access, correct, or delete your personal information, or to close your membership.
            Just contact us using the details below.
          </p>
        </section>

        <section style={sec}>
          <h2 style={h2}>Children</h2>
          <p style={p}>Our service is intended for adults. We do not knowingly collect information from children.</p>
        </section>

        <section style={sec}>
          <h2 style={h2}>Changes to this policy</h2>
          <p style={p}>We may update this policy from time to time. The &quot;last updated&quot; date above shows the latest version.</p>
        </section>

        <section style={sec}>
          <h2 style={h2}>Contact us</h2>
          <p style={p}>Questions about your privacy? Email us at <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: COLORS.blue, fontWeight: 700 }}>{SUPPORT_EMAIL}</a>.</p>
        </section>
      </div>
    </main>
  );
}
