"use client";

// web/app/page.tsx
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { BOX_PRICES, FLAVORS } from "@/lib/catalog";

type CartItem = {
  boxSize: 1 | 3 | 6;
  items: { flavorId: string; qty: number }[];
  price: number;
  createdAt: number;
  giftNote?: string;
};

const CART_KEY = "cookieDohCart";

function safeGetName(flavorId: string) {
  const f = FLAVORS.find((x: any) => x.id === flavorId);
  return f?.name ?? flavorId;
}

export default function HomePage() {
  const router = useRouter();

  // ✅ Presets (edit anytime)
  const preset3 = useMemo(
    () => [
      { flavorId: "the-one", qty: 1 },
      { flavorId: "the-other-one", qty: 1 },
      { flavorId: "matcha-magic", qty: 1 },
    ],
    []
  );

  const preset6 = useMemo(
    () => [
      { flavorId: "the-one", qty: 2 },
      { flavorId: "the-other-one", qty: 2 },
      { flavorId: "matcha-magic", qty: 1 },
      { flavorId: "the-comfort", qty: 1 },
    ],
    []
  );

  function addPresetToCart(boxSize: 3 | 6, items: { flavorId: string; qty: number }[]) {
    const item: CartItem = {
      boxSize,
      items,
      price: BOX_PRICES[boxSize],
      createdAt: Date.now(),
    };

    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const current: CartItem[] = Array.isArray(parsed) ? parsed : [];
      localStorage.setItem(CART_KEY, JSON.stringify([item, ...current]));
    } catch {
      // ignore
    }

    router.push("/cart");
  }

  return (
    <main style={{ background: "#FAF7F2" }}>
      {/* HERO */}
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
              background: "rgba(0, 82, 204, 0.10)",
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
            Where the
            <br />
            cookie magic happens
          </h1>

          <p
            style={{
              margin: "0 auto 28px",
              maxWidth: 420,
              fontSize: 16,
              lineHeight: 1.6,
              color: "#3C3C3C",
            }}
          >
            Life feels better with warm cookies.
            <br />
            Thoughtfully baked in small batches, with soft centers and golden edges.
            <br />
            Pick your favorites — we’ll take care of the rest.
          </p>

          {/* Primary CTA */}
          <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
            <div style={{ fontSize: 14, color: "#3C3C3C" }}>Build your perfect box</div>
            <Link
              href="/build"
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

      {/* CROWD FAVORITES + QUICK PICKS */}
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
            Want the easiest choice? Pick a ready-made box — one tap, done.
          </p>

          {/* Quick Picks */}
          <div
            style={{
              marginTop: 18,
              display: "grid",
              gap: 14,
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            }}
          >
            {/* Box of 3 */}
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.10)",
                borderRadius: 18,
                background: "rgba(0,0,0,0.02)",
                padding: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>Box of 3 · Crowd Favorites</div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "rgba(0,0,0,0.70)", lineHeight: 1.4 }}>
                    {preset3.map((x) => safeGetName(x.flavorId)).join(" • ")}
                  </div>
                </div>
                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(0,0,0,0.12)",
                    background: "#fff",
                    fontSize: 12,
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                  }}
                >
                  IDR {BOX_PRICES[3].toLocaleString("id-ID")}
                </div>
              </div>

              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => addPresetToCart(3, preset3)}
                  style={{
                    width: "100%",
                    borderRadius: 999,
                    padding: "12px 14px",
                    border: "none",
                    background: "#0052CC",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: "pointer",
                    boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
                  }}
                >
                  Add Box of 3
                </button>

                <Link
                  href="/build/3"
                  style={{
                    textAlign: "center",
                    textDecoration: "none",
                    color: "rgba(0,0,0,0.75)",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  Customize this box →
                </Link>
              </div>
            </div>

            {/* Box of 6 */}
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.10)",
                borderRadius: 18,
                background: "rgba(0,0,0,0.02)",
                padding: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>Box of 6 · Best Mix</div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "rgba(0,0,0,0.70)", lineHeight: 1.4 }}>
                    {preset6
                      .map((x) => `${safeGetName(x.flavorId)}${x.qty > 1 ? ` ×${x.qty}` : ""}`)
                      .join(" • ")}
                  </div>
                </div>
                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(0,0,0,0.12)",
                    background: "#fff",
                    fontSize: 12,
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                  }}
                >
                  IDR {BOX_PRICES[6].toLocaleString("id-ID")}
                </div>
              </div>

              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => addPresetToCart(6, preset6)}
                  style={{
                    width: "100%",
                    borderRadius: 999,
                    padding: "12px 14px",
                    border: "none",
                    background: "#0052CC",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: "pointer",
                    boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
                  }}
                >
                  Add Box of 6
                </button>

                <Link
                  href="/build/6"
                  style={{
                    textAlign: "center",
                    textDecoration: "none",
                    color: "rgba(0,0,0,0.75)",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  Customize this box →
                </Link>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 18, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
            Prefer full control? Build from scratch anytime.
          </div>
        </div>
      </section>
    </main>
  );
}
