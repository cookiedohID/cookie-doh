// web/app/page.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ background: "#FAF7F2" }}>
      <section
        style={{
          minHeight: "85vh",
          padding: "64px 16px 56px",
          display: "grid",
          placeItems: "center",
        }}
      >
        <div style={{ width: "100%", maxWidth: 720, textAlign: "center" }}>
          {/* Warm welcome strip */}
          <div
            style={{
              height: 40,
              display: "grid",
              placeItems: "center",
              borderRadius: 999,
              background: "rgba(0, 82, 204, 0.10)", // Pantone 293C-ish tint
              color: "#003A8C",
              fontSize: 12,
              letterSpacing: "0.08em",
              margin: "0 auto 28px",
              maxWidth: 520,
              padding: "0 14px",
            }}
          >
            ✨ Freshly baked daily • Small batches • Jakarta delivery
          </div>

          <div
            style={{
              fontSize: 12,
              letterSpacing: "0.12em",
              color: "#1F1F1F",
              opacity: 0.7,
              marginBottom: 12,
            }}
          >
            COOKIE DOH KITCHEN
          </div>

          <h1
            style={{
              fontSize: 38,
              lineHeight: 1.15,
              fontWeight: 600,
              margin: "0 0 18px",
              color: "#101010",
            }}
          >
            This is where
            <br />
            cookie magic happens
          </h1>

          <p
            style={{
              margin: "0 auto 28px",
              maxWidth: 360,
              fontSize: 16,
              lineHeight: 1.6,
              color: "#3C3C3C",
            }}
          >
            Life feels better with warm cookies.
            <br />
            Thoughtfully baked in small batches, with soft centers and golden
            edges.
            <br />
            Pick your favorites — we’ll take care of the rest.
          </p>

          {/* ✅ ONE click = start building (no redundant second button) */}
          <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
            <div style={{ fontSize: 14, color: "#3C3C3C" }}>
              Build your perfect box
            </div>
            <Link
              href="/build-a-box"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                padding: "14px 24px",
                background: "#0052CC",
                color: "#fff",
                fontWeight: 600,
                textDecoration: "none",
                boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                minHeight: 48,
              }}
            >
              Build your box 🍪
            </Link>
          </div>

          {/* Cozy divider */}
          <div
            style={{
              margin: "34px auto 0",
              width: 96,
              height: 1,
              background: "rgba(0,0,0,0.08)",
            }}
          />
        </div>
      </section>

      {/* Section header only — NO second Build button */}
      <section style={{ background: "#fff", padding: "48px 16px 56px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <h2
            style={{
              fontSize: 24,
              lineHeight: 1.25,
              margin: "0 0 10px",
              color: "#101010",
              fontWeight: 600,
            }}
          >
            Crowd favorites
            <br />
            <span style={{ fontWeight: 500, opacity: 0.6 }}>(for a reason)</span>
          </h2>

          <p style={{ margin: 0, color: "#6B6B6B", maxWidth: 520 }}>
            Start with the classics — then mix in something fun once you’re
            warmed up.
          </p>

          {/* Intentional: no CTA here. The primary CTA already takes them to build. */}
        </div>
      </section>
    </main>
  );
}
