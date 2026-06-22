// web/app/assortments/page.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BOX_PRICES, FLAVORS } from "@/lib/catalog";
import { addBoxToCart, type CartBox } from "@/lib/cart";
import { ASSORTMENTS, type Assortment } from "@/lib/assortments";
import { COLORS } from "@/lib/theme";

type BoxSize = 3 | 6;
type PresetItem = { flavorId: string; qty: number };

const COOKIE_PRICE = 32500;
const formatIDR = (n: number) => `Rp ${Number(n).toLocaleString("id-ID")}`;

function flavor(id: string) {
  return FLAVORS.find((x: any) => x.id === id) as any;
}

function presetToCartBox(boxSize: BoxSize, items: PresetItem[]): CartBox {
  const cartItems = items
    .map((x) => {
      const f = flavor(x.flavorId);
      if (!f) return null;
      return { id: String(f.id), name: String(f.name), image: String(f.image ?? ""), quantity: Number(x.qty), price: COOKIE_PRICE };
    })
    .filter(Boolean) as CartBox["items"];
  return { boxSize, items: cartItems, total: BOX_PRICES[boxSize] };
}

export default function AssortmentsPage() {
  const router = useRouter();
  const [detail, setDetail] = useState<Assortment | null>(null);

  const assortments = ASSORTMENTS;

  function addPreset(a: Assortment) {
    addBoxToCart(presetToCartBox(a.boxSize, a.items));
    router.push("/cart");
  }

  return (
    <main style={{ background: COLORS.bg, minHeight: "100vh" }}>
      {/* Header */}
      <section style={{ background: COLORS.blue, color: "#fff" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "40px 16px 36px" }}>
          <span className="font-dearjoe" style={{ fontSize: 26, opacity: 0.95 }}>ready in one tap</span>
          <h1 style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 800, lineHeight: 1.05 }}>Assortments</h1>
          <p style={{ margin: "12px 0 0", maxWidth: 560, opacity: 0.9, lineHeight: 1.5 }}>
            Hand-picked boxes for when you don&apos;t want to decide. Or build your own from scratch.
          </p>
        </div>
      </section>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 16px 72px", display: "grid", gap: 22 }}>
        {assortments.map((a) => {
          const distinct = a.items.map((it) => flavor(it.flavorId)).filter(Boolean);
          return (
            <article
              key={a.key}
              style={{
                borderRadius: 22,
                overflow: "hidden",
                background: "#fff",
                border: "1px solid rgba(0,0,0,0.10)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
              }}
            >
              {/* Photo strip — tap for details */}
              <div onClick={() => setDetail(a)} role="button" aria-label={`${a.title} — details`} style={{ display: "grid", gridTemplateColumns: `repeat(${distinct.length}, 1fr)`, position: "relative", cursor: "pointer" }}>
                {distinct.map((f: any, i: number) => (
                  <div key={i} style={{ position: "relative", aspectRatio: "1/1", background: COLORS.sand }}>
                    {f.image ? <Image src={f.image} alt={f.name} fill style={{ objectFit: "cover" }} sizes="(max-width:768px) 25vw, 240px" /> : null}
                  </div>
                ))}
                <span style={{ position: "absolute", top: 12, left: 12, background: COLORS.orange, color: "#fff", fontSize: 12, fontWeight: 800, padding: "5px 11px", borderRadius: 999 }}>
                  {a.badge}
                </span>
                <span style={{ position: "absolute", top: 12, right: 12, width: 28, height: 28, borderRadius: 999, background: "rgba(255,255,255,0.92)", color: COLORS.blue, fontWeight: 900, fontSize: 14, display: "grid", placeItems: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}>ⓘ</span>
              </div>

              <div style={{ padding: "18px 18px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <span className="font-dearjoe" style={{ fontSize: 18, color: COLORS.blue }}>{a.tagline}</span>
                    <h2 style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 800, color: COLORS.black }}>
                      {a.title} <span style={{ color: COLORS.muted, fontWeight: 700, fontSize: 15 }}>· Box of {a.boxSize}</span>
                    </h2>
                  </div>
                  <div style={{ fontWeight: 900, color: COLORS.blue, fontSize: 20 }}>{formatIDR(BOX_PRICES[a.boxSize])}</div>
                </div>

                <p className="hidden sm:block" style={{ margin: "12px 0 0", color: "#444", lineHeight: 1.55, fontSize: 14.5 }}>{a.description}</p>

                <div className="hidden sm:flex" style={{ margin: "14px 0 0", flexWrap: "wrap", gap: 6 }}>
                  {a.items.map((it) => (
                    <span key={it.flavorId} style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.black, background: COLORS.sand, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 999, padding: "5px 11px" }}>
                      {flavor(it.flavorId)?.name}{it.qty > 1 ? ` ×${it.qty}` : ""}
                    </span>
                  ))}
                </div>

                <button type="button" className="sm:hidden" onClick={() => setDetail(a)} style={{ alignSelf: "start", marginTop: 12, border: "none", background: "none", color: COLORS.blue, fontWeight: 700, fontSize: 13.5, cursor: "pointer", padding: 0 }}>What&apos;s inside →</button>

                <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => addPreset(a)}
                    style={{ border: "none", borderRadius: 999, padding: "13px 24px", background: COLORS.blue, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 10px 22px rgba(0,0,0,0.08)" }}>
                    Add to cart · {formatIDR(BOX_PRICES[a.boxSize])}
                  </button>
                  <Link href={`/build?size=${a.boxSize}`} style={{ color: COLORS.blue, fontWeight: 800, textDecoration: "none", fontSize: 14 }}>
                    Customize this box →
                  </Link>
                </div>
              </div>
            </article>
          );
        })}

        <div style={{ textAlign: "center", marginTop: 4 }}>
          <Link href="/build" style={{ color: COLORS.blue, fontWeight: 800, textDecoration: "none" }}>
            Prefer full control? Build your own box →
          </Link>
        </div>
      </div>

      {detail ? (() => {
        const a = detail;
        const distinct = a.items.map((it) => flavor(it.flavorId)).filter(Boolean);
        return (
          <div onClick={() => setDetail(null)} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, maxWidth: 440, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${distinct.length}, 1fr)`, position: "relative" }}>
                {distinct.map((f: any, i: number) => (
                  <div key={i} style={{ position: "relative", aspectRatio: "1/1", background: COLORS.sand }}>
                    {f.image ? <Image src={f.image} alt={f.name} fill style={{ objectFit: "cover" }} sizes="160px" /> : null}
                  </div>
                ))}
                <button onClick={() => setDetail(null)} aria-label="Close" style={{ position: "absolute", top: 10, right: 10, width: 32, height: 32, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.95)", fontWeight: 900, cursor: "pointer", fontSize: 16 }}>×</button>
              </div>
              <div style={{ padding: 18 }}>
                <span className="font-dearjoe" style={{ fontSize: 18, color: COLORS.blue }}>{a.tagline}</span>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <h3 style={{ margin: "2px 0 0", fontSize: 21, fontWeight: 800, color: COLORS.black }}>{a.title} <span style={{ color: COLORS.muted, fontWeight: 700, fontSize: 14 }}>· Box of {a.boxSize}</span></h3>
                  <span style={{ fontWeight: 900, color: COLORS.blue, fontSize: 20, whiteSpace: "nowrap" }}>{formatIDR(BOX_PRICES[a.boxSize])}</span>
                </div>
                <p style={{ color: "#444", fontSize: 14, marginTop: 10, lineHeight: 1.55 }}>{a.description}</p>
                <div style={{ fontWeight: 800, fontSize: 13, color: COLORS.black, margin: "14px 0 8px" }}>What&apos;s inside</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {a.items.map((it) => {
                    const f = flavor(it.flavorId);
                    return (
                      <div key={it.flavorId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 12, background: COLORS.sand }}>
                        <div style={{ position: "relative", width: 40, height: 40, borderRadius: 8, overflow: "hidden", flex: "0 0 auto", background: "#fff" }}>
                          {f?.image ? <Image src={f.image} alt={f.name} fill style={{ objectFit: "cover" }} sizes="40px" /> : null}
                        </div>
                        <span style={{ fontWeight: 700, fontSize: 13.5, color: COLORS.black }}>{f?.name}{it.qty > 1 ? ` × ${it.qty}` : ""}</span>
                      </div>
                    );
                  })}
                </div>
                <button type="button" onClick={() => { setDetail(null); addPreset(a); }} style={{ marginTop: 16, width: "100%", height: 48, borderRadius: 999, border: "none", background: COLORS.blue, color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer" }}>Add to cart · {formatIDR(BOX_PRICES[a.boxSize])}</button>
                <Link href={`/build?size=${a.boxSize}`} onClick={() => setDetail(null)} style={{ display: "block", textAlign: "center", marginTop: 10, color: COLORS.blue, fontWeight: 800, textDecoration: "none", fontSize: 14 }}>Customize this box →</Link>
              </div>
            </div>
          </div>
        );
      })() : null}
    </main>
  );
}
