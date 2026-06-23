"use client";

// web/app/page.tsx
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { BOX_PRICES, FLAVORS } from "@/lib/catalog";
import { addBoxToCart, type CartBox } from "@/lib/cart";
import ProductCard, { type FlavorUI as CardFlavorUI } from "@/components/ProductCard";
import SmoothieCard from "@/components/SmoothieCard";
import { SMOOTHIES } from "@/lib/smoothies";
import { COLORS } from "@/lib/theme";

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
    image2: String(f.image2 ?? ""),
    description: String(f.description ?? ""),
    ingredients: Array.isArray(f.ingredients)
        ? f.ingredients.map((x: any) => String(x))
        : [],
    textureTags: Array.isArray(f.tags) ? f.tags : [],
    intensity: f.intensity,
    badges: Array.isArray(f.badges) ? f.badges : [],
    price: COOKIE_PRICE,
    soldOut: Boolean((f as any).soldOut),
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
      { flavorId: "midnight-crave", qty: 1 },
    ],
    []
  );

  function addPresetToCart(boxSize: 3 | 6, items: { flavorId: string; qty: number }[]) {
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
      {/* HERO SECTION */}
      <section className="relative flex min-h-[80vh] items-center overflow-hidden">
        {/* Optimized, priority-loaded hero image (replaces the raw CSS background) */}
        <Image
          src="/flavors/CxCookiedoh/hero image.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          style={{ objectFit: "cover" }}
        />

        {/* Overlay */}
        <div className="absolute inset-0 bg-black/40" />

        {/* Content */}
        <div className="relative z-10 mx-auto w-full max-w-7xl px-6">
          <h1 className="text-5xl font-bold leading-[1.05] text-white md:text-7xl">
            Cookie Doh
          </h1>
          <span className="font-dearjoe mt-3 block text-3xl text-white md:text-4xl">
            where the cookie magic happens
          </span>

          <p className="mt-5 max-w-md text-lg text-white/90">
            Build your own box of freshly baked gourmet cookies — packed with
            care, ready to gift.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/build"
              className="rounded-full bg-white px-7 py-3.5 font-bold text-[#0014a7] shadow-lg transition hover:scale-[1.03]"
            >
              Build Your Box
            </Link>

            <Link
              href="/flavors"
              className="rounded-full border border-white/70 px-7 py-3.5 font-semibold text-white transition hover:bg-white/10"
            >
              Explore Flavours
            </Link>
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section style={{ background: COLORS.blue, color: COLORS.white }}>
        <div
          style={{
            maxWidth: 980,
            margin: "0 auto",
            padding: "16px 16px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
            textAlign: "center",
          }}
        >
          {[
            { icon: "🍪", label: "Baked fresh to order" },
            { icon: "🎁", label: "Gift-ready packaging" },
            { icon: "🛵", label: "Next-day Jakarta delivery" },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              <span style={{ fontSize: 18 }} aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </div>
          ))}
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

          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 items-start sm:items-stretch" style={{ marginTop: 16 }}>
            {cardFlavors.map((f) => (
              <ProductCard
                key={f.id}
                flavor={f}
                quantity={0}
                onAdd={() => router.push("/build")}
                onRemove={() => {}}
                disabledAdd={false}
                addLabel="Build a box"
                showQty={false}
              />
            ))}
          </div>
        </div>
      </section>

      {/* SMOOTHIES (Cookie Doh Blend) — 2 columns */}
      <section style={{ background: COLORS.white, padding: "44px 16px 70px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 650, color: COLORS.black }}>
                Cookie Doh Blend
              </h2>
              <p style={{ margin: "8px 0 0", color: "#6B6B6B", maxWidth: 560 }}>
                Freshly blended fruit, yoghurt &amp; sorbet — every blend Rp 39.000.
              </p>
            </div>

            <Link
              href="/smoothies"
              style={{
                textDecoration: "none",
                fontWeight: 800,
                color: COLORS.blue,
                whiteSpace: "nowrap",
              }}
            >
              See full menu →
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 items-start sm:items-stretch" style={{ marginTop: 16 }}>
            {SMOOTHIES.map((s) => (
              <SmoothieCard key={s.id} item={s} />
            ))}
          </div>
        </div>
      </section>

      {/* SUBSCRIBE CTA */}
      <section style={{ background: COLORS.orange, color: COLORS.white, padding: "44px 16px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", gap: 18, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ maxWidth: 600 }}>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>Cookies on repeat 🔁</h2>
            <p style={{ margin: "8px 0 0", fontSize: 16, lineHeight: 1.5, opacity: 0.95 }}>
              Subscribe to a box of 3 or 6 — fixed favourites or a curated surprise, delivered weekly,
              fortnightly or monthly. Prepay a plan and get a <b>free bonus cookie in every box</b>. Skip,
              pause or cancel anytime.
            </p>
          </div>
          <Link
            href="/subscribe"
            style={{
              textDecoration: "none", background: COLORS.white, color: COLORS.orange,
              fontWeight: 800, fontSize: 16, padding: "14px 28px", borderRadius: 999, whiteSpace: "nowrap",
            }}
          >
            Start a subscription →
          </Link>
        </div>
      </section>
    </main>
  );
}
