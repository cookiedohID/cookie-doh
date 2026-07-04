"use client";

// web/app/tbs/p/[sku]/page.tsx — TotalBuahStore product detail page
// (kurly.com-style): big visual, price + unit, quantity stepper, add to
// basket, availability across ALL stores, related products. No product photos
// exist yet, so the visual is a branded category tile (image_url-ready).
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  RED, GREEN, CREAM, rp, catLabel, catEmoji, tileColors,
  loadBasket, saveBasket, useTbsGate, ComingSoon, type BasketLine,
} from "../../shared";

type Product = { sku: string; name: string; category: string | null; categoryName?: string | null; price: number; unit: string; weighed: boolean };
type Variant = { uom: string; factor: number; label: string; price: number; stock: number };
type Avail = { store: string; storeName: string; stock: number; status: "in_stock" | "out_of_stock" | "unknown" };
type Related = { sku: string; name: string; category: string | null; price: number; unit: string };

export default function TbsProductPage() {
  const { gate, preview } = useTbsGate();
  const params = useParams<{ sku: string }>();
  const sku = decodeURIComponent(String(params?.sku || ""));
  const [store, setStore] = useState("");
  const [data, setData] = useState<{ product: Product; availability: Avail[]; related: Related[]; variants: Variant[] } | null>(null);
  const [variant, setVariant] = useState<Variant | null>(null);
  const [missing, setMissing] = useState(false);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => { setStore(localStorage.getItem("tbs_store") || "TBS-RCV"); }, []);

  useEffect(() => {
    if (gate !== "open" || !store || !sku) return;
    (async () => {
      try {
        const j = await (await fetch(`/api/tbs/product?store=${encodeURIComponent(store)}&sku=${encodeURIComponent(sku)}`, { cache: "no-store" })).json();
        if (j?.ok && j.found) {
          const variants: Variant[] = Array.isArray(j.variants) ? j.variants : [];
          setData({ product: j.product, availability: j.availability || [], related: j.related || [], variants });
          setVariant(variants.find((v) => v.factor <= 1) || variants[0] || null);
        }
        else setMissing(true);
      } catch { setMissing(true); }
    })();
  }, [gate, store, sku]);

  const mine = useMemo(() => data?.availability.find((a) => a.store === store), [data, store]);
  const mineLive = mine && mine.status !== "unknown";
  const out = mine?.status === "out_of_stock";

  // Selected variant drives price + basket line. Variants use a composite
  // "SKU@UOM" code end-to-end (the ERP /stock endpoint reprices it), so the
  // checkout money path needs no special-casing.
  const sel = variant;
  const selPrice = sel ? sel.price : data?.product.price || 0;
  const selKey = sel && sel.factor > 1 ? `${data?.product.sku}@${sel.uom}` : data?.product.sku || "";
  const selName = sel && sel.factor > 1 ? `${data?.product.name} (${sel.label})` : data?.product.name || "";
  const selOut = Boolean(mineLive && sel && sel.stock < 1);

  const addToBasket = () => {
    if (!data || !selKey) return;
    const items = loadBasket(store);
    const cur = items[selKey]?.qty || 0;
    items[selKey] = {
      sku: selKey, name: selName,
      price: selPrice, unit: sel && sel.factor > 1 ? "box" : data.product.unit,
      qty: Math.min(99, cur + qty), uom: sel?.uom,
    } as BasketLine;
    saveBasket(store, items);
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  };

  if (gate === "loading") return <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "#888" }}>Loading…</main>;
  if (gate === "hidden") return <ComingSoon />;

  if (missing) {
    return (
      <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 20 }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 15, color: "#666" }}>This product isn&apos;t in the online catalog.</p>
          <Link href="/tbs" style={{ color: RED, fontWeight: 800, textDecoration: "none" }}>← Back to the shop</Link>
        </div>
      </main>
    );
  }

  const p = data?.product;
  const t = tileColors(p?.category ?? null);

  return (
    <main style={{ minHeight: "100vh", background: CREAM }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "16px 14px 90px" }}>
        {preview ? (
          <div style={{ background: "#FFF6E5", border: "1px solid #F0DCA8", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, color: "#7a5c00", fontWeight: 700, marginBottom: 12 }}>
            👁️ Preview mode — customers see this after launch.
          </div>
        ) : null}

        {/* breadcrumb */}
        <nav style={{ fontSize: 12.5, color: "#999", marginBottom: 12 }}>
          <Link href="/tbs" style={{ color: "#999", textDecoration: "none" }}>Shop</Link>
          {p?.category ? <> · <Link href="/tbs" style={{ color: GREEN, textDecoration: "none", fontWeight: 700 }}>{catLabel(p.category)}</Link></> : null}
        </nav>

        {!p ? <p style={{ color: "#999" }}>Loading…</p> : (
          <>
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
              {/* visual */}
              <div style={{ background: t.bg, borderRadius: 18, minHeight: 280, display: "grid", placeItems: "center", position: "relative" }}>
                <span style={{ fontSize: 92, opacity: 0.9 }}>{catEmoji(p.category)}</span>
                {p.weighed ? <span style={{ position: "absolute", bottom: 14, left: 14, fontSize: 12, fontWeight: 800, background: "#fff", color: GREEN, borderRadius: 999, padding: "4px 11px" }}>±1kg pack</span> : null}
              </div>

              {/* info */}
              <div style={{ background: "#fff", borderRadius: 18, border: "1px solid rgba(0,0,0,0.06)", padding: "20px 20px 22px" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: GREEN, textTransform: "uppercase", letterSpacing: 0.5 }}>{catLabel(p.category)}</div>
                <h1 style={{ margin: "6px 0 2px", fontSize: 21, lineHeight: 1.3, fontWeight: 900, color: "#191919" }}>{p.name}</h1>
                <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 27, fontWeight: 600, color: "#191919" }}>{rp(selPrice)}</span>
                  <span style={{ fontSize: 13, color: "#999" }}>per {sel && sel.factor > 1 ? "box" : p.unit}</span>
                </div>

                {data!.variants.length > 1 ? (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#666", marginBottom: 6 }}>Choose an option</div>
                    {data!.variants.map((v) => {
                      const vOut = Boolean(mineLive && v.stock < 1);
                      const active = sel?.uom === v.uom;
                      return (
                        <button key={v.uom} disabled={vOut} onClick={() => setVariant(v)}
                          style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "11px 13px", marginBottom: 6, borderRadius: 10, cursor: vOut ? "default" : "pointer", textAlign: "left",
                            border: active ? `2px solid ${GREEN}` : "1px solid rgba(0,0,0,0.13)",
                            background: vOut ? "#f5f5f5" : active ? "#F0F7EE" : "#fff", color: vOut ? "#aaa" : "#222" }}>
                          <span style={{ fontSize: 13.5 }}>{vOut ? "(Sold out) " : ""}{v.label}</span>
                          <span style={{ fontSize: 13.5, fontWeight: 500, color: vOut ? "#aaa" : "#191919" }}>{rp(v.price)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {p.weighed ? <p style={{ fontSize: 12.5, color: "#8a6d3b", background: "#FCF8E3", borderRadius: 8, padding: "7px 10px", marginTop: 10 }}>Sold as a fixed-price pack of about 1 kg — the store packs it fresh for you.</p> : null}

                {/* qty + add */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid rgba(0,0,0,0.15)", borderRadius: 999, padding: "6px 10px" }}>
                    <button onClick={() => setQty((n) => Math.max(1, n - 1))} style={{ border: "none", background: "transparent", fontSize: 18, fontWeight: 900, cursor: "pointer", color: GREEN }}>−</button>
                    <span style={{ fontWeight: 900, minWidth: 22, textAlign: "center" }}>{qty}</span>
                    <button onClick={() => setQty((n) => Math.min(99, n + 1))} style={{ border: "none", background: "transparent", fontSize: 18, fontWeight: 900, cursor: "pointer", color: GREEN }}>+</button>
                  </div>
                  <button onClick={addToBasket} disabled={out || selOut}
                    style={{ flex: 1, border: "none", borderRadius: 12, padding: "13px 16px", fontWeight: 900, fontSize: 14.5, cursor: out ? "default" : "pointer", background: out ? "#eee" : added ? GREEN : "#7CB342", color: out ? "#aaa" : "#fff", transition: "background .2s" }}>
                    {out || selOut ? "Out of stock at your store" : added ? "✓ Added to basket" : `Add to basket — ${rp(selPrice * qty)}`}
                  </button>
                </div>

                {/* availability across stores */}
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Availability</div>
                  {data!.availability.map((a) => (
                    <div key={a.store} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 10, marginBottom: 4, background: a.store === store ? "#F0F7EE" : "transparent", border: a.store === store ? `1px solid ${GREEN}33` : "1px solid transparent" }}>
                      <span style={{ fontSize: 13, fontWeight: a.store === store ? 800 : 600, color: "#333" }}>
                        {a.storeName}{a.store === store ? " · your store" : ""}
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: a.status === "in_stock" ? GREEN : a.status === "out_of_stock" ? "#b33" : "#8a6d3b" }}>
                        {a.status === "in_stock" ? (a.stock > 0 && a.stock <= 5 ? "🔺 Low stock" : "🟢 In stock") : a.status === "out_of_stock" ? "✕ Out of stock" : "Confirmed by store"}
                      </span>
                    </div>
                  ))}
                </div>

                {/* facts table */}
                <div style={{ marginTop: 16, borderTop: "1px solid rgba(0,0,0,0.07)", paddingTop: 10 }}>
                  {[["Unit", p.unit], ["Category", catLabel(p.category)], ["Product code", p.sku], ["Fulfilment", "Pickup or delivery from your store"]].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", fontSize: 12.5 }}>
                      <span style={{ color: "#999" }}>{k}</span><span style={{ color: "#333", fontWeight: 700, textAlign: "right", wordBreak: "break-all" }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* related */}
            {data!.related.length ? (
              <section style={{ marginTop: 26 }}>
                <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 900, color: "#191919", textTransform: "uppercase", letterSpacing: 0.4 }}>More {catLabel(p.category)}</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                  {data!.related.map((r) => {
                    const rt = tileColors(r.category);
                    return (
                      <Link key={r.sku} href={`/tbs/p/${encodeURIComponent(r.sku)}`} style={{ textDecoration: "none", background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(0,0,0,0.07)" }}>
                        <div style={{ height: 140, background: rt.bg, display: "grid", placeItems: "center", fontSize: 40 }}>{catEmoji(r.category)}</div>
                        <div style={{ padding: "9px 10px 11px" }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#222", lineHeight: 1.3, minHeight: 32 }}>{r.name}</div>
                          <div style={{ fontSize: 13.5, fontWeight: 500, color: "#191919", marginTop: 4 }}>{rp(r.price)}</div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
