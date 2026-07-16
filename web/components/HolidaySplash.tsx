// web/components/HolidaySplash.tsx — the warm "we're upgrading, back in September"
// screen shown to customers while the storefront is on holiday. Full-screen,
// on-brand, and gently reassuring — never a cold "maintenance" error.
import { HOLIDAY_RETURN_LABEL, HOLIDAY_INSTAGRAM } from "@/lib/holiday";

const BLUE = "#0014A7";
const ORANGE = "#FF5A00";
const CREAM = "#FAF7F2";

export default function HolidaySplash() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: `radial-gradient(1200px 600px at 50% -10%, #FFF6EC 0%, ${CREAM} 55%)`,
        display: "grid",
        placeItems: "center",
        padding: "40px 20px",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 520, width: "100%" }}>
        {/* logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Cookie Doh" style={{ height: 40, width: "auto", margin: "0 auto 26px", display: "block" }} />

        <div style={{ fontSize: 60, lineHeight: 1, marginBottom: 14 }}>🍪✨</div>

        <div className="font-dearjoe" style={{ color: ORANGE, fontSize: 24, marginBottom: 6 }}>
          be right back
        </div>

        <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.15, fontWeight: 800, color: BLUE, letterSpacing: -0.4 }}>
          We&apos;re baking something<br />even better.
        </h1>

        <p style={{ margin: "18px auto 0", maxWidth: 440, fontSize: 16, lineHeight: 1.6, color: "#4a4a4a" }}>
          Cookie Doh is taking a short break to <b>upgrade our little kitchen</b> —
          fresh flavours, a smoother shop, and a few sweet surprises are in the oven. 💛
        </p>

        {/* return date — the hero line */}
        <div
          style={{
            margin: "26px auto 0",
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            background: "#fff",
            border: "1px solid rgba(0,20,167,0.15)",
            borderRadius: 999,
            padding: "12px 22px",
            boxShadow: "0 10px 26px rgba(0,0,0,0.06)",
          }}
        >
          <span style={{ fontSize: 20 }}>🗓️</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: BLUE }}>
            Back in {HOLIDAY_RETURN_LABEL}
          </span>
        </div>

        <p style={{ margin: "26px auto 0", fontSize: 14.5, color: "#6b6b6b", lineHeight: 1.6 }}>
          Thank you for all the love — we can&apos;t wait to welcome you back.<br />
          Follow along for the big reveal:
        </p>

        {/* stay-in-touch — Instagram only (no ordering while we're on the break) */}
        <div style={{ margin: "16px auto 0", display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <a
            href={`https://instagram.com/${HOLIDAY_INSTAGRAM}`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none",
              background: "#fff", color: BLUE, fontWeight: 800, fontSize: 14.5,
              padding: "12px 20px", borderRadius: 999, border: `1px solid ${BLUE}22`,
            }}
          >
            📸 @{HOLIDAY_INSTAGRAM}
          </a>
        </div>

        {/* trademarked tagline, verbatim */}
        <div className="font-dearjoe" style={{ marginTop: 40, fontSize: 20, color: BLUE, opacity: 0.85 }}>
          where the cookie magic happens
        </div>
      </div>
    </main>
  );
}
