import Link from "next/link";
import { BOX_PRICES, formatIDR } from "@/lib/catalog";

const sizes: Array<1 | 3 | 6> = [1, 3, 6];

export default function BuildIndexPage() {
  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <header style={{ marginBottom: 18 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid rgba(0,0,0,0.10)",
            background: "rgba(0,0,0,0.02)",
            fontWeight: 900,
            fontSize: 12,
            letterSpacing: 0.2,
          }}
        >
          🍪 COOKIE DOH
          <span style={{ opacity: 0.6, fontWeight: 800 }}>Build a Box</span>
        </div>

        <h1 style={{ margin: "14px 0 8px", fontSize: 34, letterSpacing: -0.4 }}>
          Pick your box size ✨
        </h1>
        <p style={{ margin: 0, color: "rgba(0,0,0,0.70)", lineHeight: 1.5, maxWidth: 680 }}>
          Choose a size, then mix & match flavors. Duplicates are always welcome.
        </p>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 14,
          marginTop: 18,
        }}
      >
        {sizes.map((s) => {
          const isMostPopular = s === 6;
          return (
            <Link
              key={s}
              href={`/build/${s}`}
              prefetch={false}
              style={{
                display: "block",
                textDecoration: "none",
                color: "inherit",
                borderRadius: 18,
                border: "1px solid rgba(0,0,0,0.10)",
                background: "#fff",
                padding: 18,
                boxShadow: isMostPopular ? "0 14px 32px rgba(0,0,0,0.08)" : "0 8px 22px rgba(0,0,0,0.05)",
                transform: "translateY(0)",
                transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* subtle shine */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  background:
                    "linear-gradient(120deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.45) 30%, rgba(255,255,255,0) 60%)",
                  transform: "translateX(-120%)",
                  transition: "transform 520ms ease",
                }}
                className="cd-shine"
              />

              {isMostPopular && (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "rgba(0,0,0,0.06)",
                    border: "1px solid rgba(0,0,0,0.10)",
                    fontWeight: 900,
                    fontSize: 12,
                    marginBottom: 12,
                  }}
                >
                  ⭐ Most popular
                </div>
              )}

              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 1000, fontSize: 20, letterSpacing: -0.2 }}>Box of {s}</div>
                <div style={{ fontWeight: 900, color: "rgba(0,0,0,0.75)" }}>IDR {formatIDR(BOX_PRICES[s])}</div>
              </div>

              <div style={{ marginTop: 10, color: "rgba(0,0,0,0.70)", lineHeight: 1.5 }}>
                {s === 1 && "Perfect for a quick treat or a first taste."}
                {s === 3 && "Best for sharing… or not 😉"}
                {s === 6 && "Party-ready. Mix your favorites + a new one."}
              </div>

              <div
                style={{
                  marginTop: 14,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(0,0,0,0.10)",
                  background: "rgba(0,0,0,0.02)",
                  fontWeight: 950,
                }}
              >
                Choose this <span aria-hidden>→</span>
              </div>

              <style>{`
                a:hover .cd-shine { transform: translateX(120%); }
                a:hover { border-color: rgba(0,0,0,0.16); transform: translateY(-2px); }
              `}</style>
            </Link>
          );
        })}
      </section>

      <section
        style={{
          marginTop: 18,
          padding: 16,
          borderRadius: 18,
          border: "1px solid rgba(0,0,0,0.10)",
          background: "rgba(0,0,0,0.02)",
          color: "rgba(0,0,0,0.75)",
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontWeight: 950, marginBottom: 6 }}>Quick tips</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Tap <strong>Add +</strong> to fill your box. You’ll see “Remaining” count update.</li>
          <li>Duplicates are allowed (yes, all-choco is valid).</li>
          <li>Switch box size anytime at the top of the builder.</li>
        </ul>
      </section>
    </main>
  );
}
