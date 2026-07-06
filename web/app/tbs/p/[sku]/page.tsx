"use client";

// web/app/tbs/p/[sku]/page.tsx — TotalBuahStore product page, styled after
// kurly.com/goods/*: two-column (visual | sticky info panel with Kurly-style
// spec rows), option selector, total-amount row, add-to-basket + buy-now,
// then Description/Details tabs and related products.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  RED, GREEN, CREAM, rp, catLabel, catEmoji, tileColors,
  loadBasket, saveBasket, useTbsGate, ComingSoon, TBS_FALLBACK_STORES, type BasketLine,
} from "../../shared";
import { useLang } from "@/lib/i18n";

type Product = { sku: string; name: string; category: string | null; categoryName?: string | null; price: number; unit: string; weighed: boolean };
type Variant = { uom: string; factor: number; label: string; price: number; stock: number };
type Avail = { store: string; storeName: string; stock: number; status: "in_stock" | "out_of_stock" | "unknown" };
type Related = { sku: string; name: string; category: string | null; price: number; unit: string };

export default function TbsProductPage() {
  const { t: tr } = useLang();
  const { gate, preview } = useTbsGate();
  const router = useRouter();
  const params = useParams<{ sku: string }>();
  const sku = decodeURIComponent(String(params?.sku || ""));
  const [store, setStore] = useState("");
  const [data, setData] = useState<{ product: Product; availability: Avail[]; related: Related[]; variants: Variant[] } | null>(null);
  const [variant, setVariant] = useState<Variant | null>(null);
  const [missing, setMissing] = useState(false);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [tab, setTab] = useState<"desc" | "details">("desc");
  const [otherStores, setOtherStores] = useState(false);

  useEffect(() => { setStore(localStorage.getItem("tbs_store") || "TBS-RCV"); }, []);

  useEffect(() => {
    if (gate !== "open" || !store || !sku) return;
    (async () => {
      try {
        const j = await (await fetch(`/api/tbs/product?store=${encodeURIComponent(store)}&sku=${encodeURIComponent(sku)}`, { cache: "no-store" })).json();
        if (j?.ok && j.found) {
          const variants: Variant[] = Array.isArray(j.variants) ? j.variants : [];
          setData({ product: j.product, availability: j.availability || [], related: j.related || [], variants });
          let wantUom = "";
          try { wantUom = (new URLSearchParams(window.location.search).get("u") || "").toUpperCase(); } catch { /* ignore */ }
          setVariant(
            (wantUom && variants.find((v) => v.uom.toUpperCase() === wantUom)) ||
            variants.find((v) => v.factor <= 1) || variants[0] || null
          );
        } else setMissing(true);
      } catch { setMissing(true); }
    })();
  }, [gate, store, sku]);

  const mine = useMemo(() => data?.availability.find((a) => a.store === store), [data, store]);
  const mineLive = mine && mine.status !== "unknown";
  const out = mine?.status === "out_of_stock";
  const storeName = TBS_FALLBACK_STORES.find((s) => s.code === store)?.name || mine?.storeName || store;

  const sel = variant;
  const selPrice = sel ? sel.price : data?.product.price || 0;
  const selKey = sel && sel.factor > 1 ? `${data?.product.sku}@${sel.uom}` : data?.product.sku || "";
  const selName = sel && sel.factor > 1 ? `${data?.product.name} (${sel.label})` : data?.product.name || "";
  const selOut = Boolean(mineLive && sel && sel.stock < 1) || !(selPrice > 0);

  const addToBasket = () => {
    if (!data || !selKey || !(selPrice > 0)) return;
    // direct visitors may not have picked a store yet — adding here pins it,
    // otherwise checkout (which reads tbs_store) would see an empty basket
    try {
      if (localStorage.getItem("tbs_store") !== store) {
        localStorage.setItem("tbs_store", store);
        window.dispatchEvent(new Event("tbs-store"));
      }
    } catch { /* ignore */ }
    const items = loadBasket(store);
    const cur = items[selKey]?.qty || 0;
    items[selKey] = {
      sku: selKey, name: selName, price: selPrice,
      unit: sel && sel.factor > 1 ? "box" : data.product.unit,
      qty: Math.min(99, cur + qty), uom: sel?.uom,
    } as BasketLine;
    saveBasket(store, items);
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  };
  const buyNow = () => { addToBasket(); router.push("/tbs/checkout"); };

  if (gate === "loading") return <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "#888" }}>Loading…</main>;
  if (gate === "hidden") return <ComingSoon />;
  if (missing) {
    return (
      <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 20 }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 15, color: "#666" }}>{tr("p.notInCatalog")}</p>
          <Link href="/tbs" style={{ color: RED, fontWeight: 800, textDecoration: "none" }}>{tr("p.backToShop")}</Link>
        </div>
      </main>
    );
  }

  const p = data?.product;
  const t = tileColors(p?.category ?? null);
  const specRow = (k: string, v: React.ReactNode) => (
    <div key={k} style={{ display: "flex", gap: 14, padding: "10px 0", borderTop: "1px solid rgba(0,0,0,0.06)", fontSize: 13 }}>
      <span style={{ color: "#999", flex: "0 0 96px" }}>{k}</span>
      <span style={{ color: "#333", lineHeight: 1.5 }}>{v}</span>
    </div>
  );

  return (
    <main style={{ minHeight: "100vh", background: "#fff" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "16px 14px 90px" }}>
        {preview ? (
          <div style={{ background: "#FFF6E5", border: "1px solid #F0DCA8", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, color: "#7a5c00", fontWeight: 700, marginBottom: 12 }}>
            👁️ Preview mode — customers see this after launch.
          </div>
        ) : null}

        <nav style={{ fontSize: 12.5, color: "#999", marginBottom: 12 }}>
          <Link href="/tbs" style={{ color: "#999", textDecoration: "none" }}>Shop</Link>
          {p?.category ? <> · <Link href={`/tbs/c/${encodeURIComponent(p.category)}`} style={{ color: GREEN, textDecoration: "none", fontWeight: 700 }}>{catLabel(p.category)}</Link></> : null}
        </nav>

        {!p ? <p style={{ color: "#999" }}>Loading…</p> : (
          <>
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 26, alignItems: "start" }}>
              <div style={{ background: t.bg, borderRadius: 14, minHeight: 380, display: "grid", placeItems: "center", position: "relative" }}>
                <span style={{ fontSize: 110, opacity: 0.9 }}>{catEmoji(p.category)}</span>
                {p.weighed ? <span style={{ position: "absolute", bottom: 14, left: 14, fontSize: 12, fontWeight: 800, background: "#fff", color: GREEN, borderRadius: 999, padding: "4px 11px" }}>±1kg pack</span> : null}
              </div>

              <div style={{ position: "sticky", top: 104 }}>
                <div style={{ fontSize: 12, color: GREEN, fontWeight: 800, letterSpacing: 0.4 }}>{catLabel(p.category)}</div>
                <h1 style={{ margin: "5px 0 3px", fontSize: 22, lineHeight: 1.3, fontWeight: 700, color: "#191919" }}>{p.name}</h1>
                <p style={{ margin: 0, fontSize: 13, color: "#999" }}>Fresh from TotalBuahStore — {storeName}</p>
                <div style={{ margin: "12px 0 4px", display: "flex", alignItems: "baseline", gap: 7 }}>
                  <span style={{ fontSize: 28, fontWeight: 700, color: "#191919" }}>{rp(selPrice)}</span>
                  <span style={{ fontSize: 13, color: "#999" }}>per {sel && sel.factor > 1 ? "box" : p.unit}</span>
                </div>

                <div style={{ marginTop: 12 }}>
                  {specRow("Delivery", <>Pickup or same-day delivery from <b>{storeName}</b></>)}
                  {specRow("Seller", <>TotalBuahStore</>)}
                  {specRow("Packaging", p.weighed ? "Fresh pack (±1kg), packed by the store" : "Store packaging (eco where possible)")}
                  {specRow("Availability", mine?.status === "in_stock" ? "🟢 In stock at your store" : mine?.status === "out_of_stock" ? "✕ Out of stock at your store" : "Confirmed by the store on order")}
                </div>

                {data!.variants.length > 1 ? (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#666", marginBottom: 6 }}>{tr("p.chooseOption")}</div>
                    {data!.variants.map((v, i) => {
                      const vOut = Boolean(mineLive && v.stock < 1);
                      const active = sel?.uom === v.uom;
                      return (
                        <button key={`${v.uom}-${i}`} disabled={vOut} onClick={() => setVariant(v)}
                          style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "11px 13px", marginBottom: 6, borderRadius: 8, cursor: vOut ? "default" : "pointer", textAlign: "left",
                            border: active ? `2px solid ${GREEN}` : "1px solid rgba(0,0,0,0.13)",
                            background: vOut ? "#f5f5f5" : active ? "#F0F7EE" : "#fff", color: vOut ? "#aaa" : "#222" }}>
                          <span style={{ fontSize: 13.5 }}>{vOut ? `${tr("p.soldOut")} ` : ""}{v.label}</span>
                          <span style={{ fontSize: 13.5, fontWeight: 500, color: vOut ? "#aaa" : "#191919" }}>{rp(v.price)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8, padding: "0 4px" }}>
                    <button onClick={() => setQty((n) => Math.max(1, n - 1))} aria-label="less" style={{ border: "none", background: "transparent", fontSize: 18, fontWeight: 900, cursor: "pointer", color: GREEN, minWidth: 40, minHeight: 40 }}>−</button>
                    <span style={{ fontWeight: 700, minWidth: 22, textAlign: "center" }}>{qty}</span>
                    <button onClick={() => setQty((n) => Math.min(mineLive && sel ? Math.max(1, sel.stock) : 99, n + 1))} aria-label="more" style={{ border: "none", background: "transparent", fontSize: 18, fontWeight: 900, cursor: "pointer", color: GREEN, minWidth: 40, minHeight: 40 }}>+</button>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 12, color: "#999", marginRight: 8 }}>{tr("p.totalAmount")}</span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: "#191919" }}>{rp(selPrice * qty)}</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={addToBasket} disabled={out || selOut}
                    style={{ flex: 1.4, border: "none", borderRadius: 10, padding: "14px 16px", fontWeight: 800, fontSize: 14.5, cursor: out || selOut ? "default" : "pointer", background: out || selOut ? "#eee" : added ? GREEN : "#7CB342", color: out || selOut ? "#aaa" : "#fff", transition: "background .2s" }}>
                    {out || selOut ? "Out of stock" : added ? "✓ Added" : "Add to basket"}
                  </button>
                  <button onClick={buyNow} disabled={out || selOut}
                    style={{ flex: 1, border: `1.5px solid ${GREEN}`, borderRadius: 10, padding: "14px 12px", fontWeight: 800, fontSize: 14.5, cursor: out || selOut ? "default" : "pointer", background: "#fff", color: out || selOut ? "#aaa" : GREEN }}>
                    Buy now
                  </button>
                </div>
              </div>
            </section>

            <section style={{ marginTop: 30 }}>
              <div style={{ display: "flex", borderBottom: "1px solid rgba(0,0,0,0.1)" }}>
                {([["desc", "Description"], ["details", "Details"]] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setTab(id)}
                    style={{ flex: 1, maxWidth: 220, border: "none", background: "transparent", padding: "13px 10px", fontSize: 14.5, cursor: "pointer",
                      fontWeight: tab === id ? 800 : 500, color: tab === id ? GREEN : "#777",
                      borderBottom: tab === id ? `2.5px solid ${GREEN}` : "2.5px solid transparent", marginBottom: -1 }}>
                    {label}
                  </button>
                ))}
              </div>
              {tab === "desc" ? (
                <div style={{ padding: "20px 4px", fontSize: 14, color: "#444", lineHeight: 1.8, maxWidth: 640 }}>
                  <p style={{ margin: 0 }}>
                    <b>{p.name}</b> — from our {catLabel(p.category).toLowerCase()} range,
                    handpicked for quality and freshness by TotalBuahStore. {p.weighed
                      ? "Sold as a fixed-price pack of about 1 kg, weighed and packed fresh by the store on the day of your order."
                      : "Quality-checked at the store before it's packed for you."}
                  </p>
                  <p style={{ margin: "10px 0 0", fontStyle: "italic", color: RED }}>100% Fresh. Today and Always</p>
                </div>
              ) : (
                <div style={{ padding: "16px 4px", maxWidth: 640 }}>
                  {specRow("Product code", p.sku)}
                  {specRow("Category", catLabel(p.category))}
                  {specRow("Unit", sel ? sel.label : p.unit)}
                  {specRow("Fulfilment", "Pickup or delivery from your selected store")}
                  <button onClick={() => setOtherStores((v) => !v)}
                    style={{ display: "block", border: "none", background: "transparent", padding: "14px 0 4px", cursor: "pointer", fontSize: 13.5, fontWeight: 800, color: GREEN }}>
                    {tr("p.findOtherStores")} {otherStores ? "▴" : "▾"}
                  </button>
                  {otherStores && data!.availability.map((a) => (
                    <div key={a.store} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, marginBottom: 3, background: a.store === store ? "#F0F7EE" : "transparent" }}>
                      <span style={{ fontSize: 13, fontWeight: a.store === store ? 800 : 500, color: "#333" }}>{a.storeName}{a.store === store ? " · your store" : ""}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: a.status === "in_stock" ? GREEN : a.status === "out_of_stock" ? "#b33" : "#8a6d3b" }}>
                        {a.status === "in_stock" ? (a.stock > 0 && a.stock <= 5 ? "🔺 Low stock" : "🟢 In stock") : a.status === "out_of_stock" ? "✕ Out of stock" : "Confirmed by store"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {data!.related.length ? (
              <section style={{ marginTop: 22, background: CREAM, borderRadius: 16, padding: "16px 14px" }}>
                <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 900, color: "#191919", textTransform: "uppercase", letterSpacing: 0.4 }}>More {catLabel(p.category)}</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                  {data!.related.map((r) => {
                    const rt = tileColors(r.category);
                    return (
                      <Link key={r.sku} href={`/tbs/p/${encodeURIComponent(r.sku)}`} style={{ textDecoration: "none", background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(0,0,0,0.07)" }}>
                        <div style={{ height: 140, background: rt.bg, display: "grid", placeItems: "center", fontSize: 40 }}>{catEmoji(r.category)}</div>
                        <div style={{ padding: "9px 10px 11px" }}>
                          <div style={{ fontSize: 12.5, fontWeight: 400, color: "#333", lineHeight: 1.3, minHeight: 32 }}>{r.name}</div>
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
