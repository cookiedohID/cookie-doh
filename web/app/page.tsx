"use client";

// web/app/page.tsx
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { BOX_PRICES, FLAVORS } from "@/lib/catalog";
import { addBoxToCart, type CartBox } from "@/lib/cart";
import ProductCard, { type FlavorUI as CardFlavorUI } from "@/components/ProductCard";

const COLORS = {
  blue: ""#0014a7"", // Pantone 293C vibe
  black: "#101010",
  white: "#FFFFFF",
  bg: "#FAF7F2",
  orange: "#FF5A00", // Accent (021C-ish)
};

const COOKIE_PRICE = 32500; // builder uses fixed per-cookie price; box total comes from BOX_PRICES

function safeGetName(flavorId: string) {
  const f = FLAVORS.find((x: any) => x.id === flavorId);
  return f?.name ?? flavorId;
}

function toCardFlavor(f: any): CardFlavorUI {
  return {
    id: String(f.id),
    name: String(f.name ?? ""),
    image: String(f.image ?? ""),
    ingredients: String(f.description ?? ""),
    textureTags: Array.isArray(f.tags) ? f.tags : [],
    intensity: f.intensity,
    badges: Array.isArray(f.badges) ? f.badges : [],
    price: COOKIE_PRICE,
    soldOut: Boolean(f.soldOut),
  };
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
    // Convert preset items into the unified cart schema
    const cartItems = items
      .map((x) => {
        const f = FLAVORS.find((ff: any) => ff.id === x.flavorId);
        if (!f) return null;
        return {
          id: String(f.id),
          name: String(f.name),
          image: String(f.image ?? ""),
          quantity: Number(x.qty),
          price: COOKIE_PRICE,
        };
      })
      .filter(Boolean) as CartBox["items"];

    const box: CartBox = {
      boxSize,
      items: cartItems,
      total: BOX_PRICES[boxSize],
    };

    addBoxToCart(box);
    router.push("/cart");
  }

  const cardFlavors = useMemo(() => FLAVORS.map(toCardFlavor), []);

  return (
    <main style={{ background: COLORS.bg }}>
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
              maxWidth: 560,
              padding: "0 14px",
            }}
          >
            Freshly baked daily • Small batches • Jakarta delivery
          </div>

          <div
            style={{
              fontSize: 12,
              letterSpacing: "0.12em",
              color: COLORS.black,
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
              color: COLORS.black,
            }}
          >
            Where the
            <br />
            cookie magic happens
          </h1>

          <p
            style={{
              margin: "0 auto 28px",
              maxWidth: 440,
              fontSize: 16,
              lineHeight: 1.6,
              color: "#3C3C3C",
            }}
          >
            Life feels better with warm cookies.
            <br />
            Thoughtfully baked in small batches, with soft centers and golden edges.
            <br />
            Pick your favourites — we’ll take care of the rest.
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
                background: COLORS.blue,
                color: COLORS.white,
                fontWeight: 700,
                textDecoration: "none",
                boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                minHeight: 48,
              }}
            >
              Build your box
            </Link>

            <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
              Freshly baked · Packed with care · Gift-ready
            </div>
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
      <section style={{ background: COLORS.white, padding: "48px 16px 56px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <h2
            style={{
              fontSize: 24,
              lineHeight: 1.25,
              margin: "0 0 10px",
              color: COLORS.black,
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
                    background: COLORS.blue,
                    color: COLORS.white,
                    fontWeight: 850,
                    cursor: "pointer",
                    boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
                  }}
                >
                  Add Box of 3
                </button>

                <Link
                  href="/build"
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
                    background: COLORS.blue,
                    color: COLORS.white,
                    fontWeight: 850,
                    cursor: "pointer",
                    boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
                  }}
                >
                  Add Box of 6
                </button>

                <Link
                  href="/build"
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

      {/* FLAVOURS */}
      <section style={{ background: COLORS.bg, padding: "44px 16px 70px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 650, color: COLORS.black }}>
                Explore flavours
              </h2>
              <p style={{ margin: "8px 0 0", color: "#6B6B6B", maxWidth: 560 }}>
                Tap any flavour to start building your box.
              </p>
            </div>

            <Link
              href="/build"
              style={{
                textDecoration: "none",
                fontWeight: 800,
                color: COLORS.blue,
                whiteSpace: "nowrap",
              }}
            >
              Build a box →
            </Link>
          </div>

          <div
            style={{
              marginTop: 16,
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 14,
            }}
          >
            {cardFlavors.map((f) => (
              <ProductCard
                key={f.id}
                flavor={f}
                quantity={0}
                onAdd={() => router.push("/build")}
                onRemove={() => {}}
                disabledAdd={false}
                addLabel="Build a box"
              />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
