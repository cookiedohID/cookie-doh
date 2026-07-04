"use client";

// web/app/tbs/page.tsx — TotalBuahStore shop tab on cookiedoh.co.id.
//
// Owner decisions: full TBS brand identity (red #9c1216 / green #135232, cherry
// mark, tagline "100% Fresh. Today and Always" verbatim) but the Cookie Doh app
// font for readability; store chosen up-front (drives live stock + fulfilment);
// curated catalog = top-80%-of-revenue per category; weighed items sold as
// fixed ±1kg packs. Hidden behind the flag until the owner approves (admins
// preview via their normal admin login).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getCart } from "@/lib/cart";
import {
  RED, GREEN, CREAM, rp, catLabel, catEmoji, tileColors, TbsCherry,
  loadBasket, saveBasket, useTbsGate, ComingSoon, TbsProductCard, type BasketLine,
} from "./shared";

type Store = { code: string; name: string; city?: string; items?: number };
type Item = { sku: string; name: string; category: string | null; price: number; unit: string; weighed: boolean | null; stock: number; status: string };
type Cat = { id: string | null; name: string | null; count: number };

export default function TbsShopPage() {
  const { gate, preview } = useTbsGate();
  const [stores, setStores] = useState<Store[]>([]);
  const [stockSynced, setStockSynced] = useState(true);
  const [store, setStore] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cats, setCats] = useState<Cat[]>([]);
  const [cat, setCat] = useState<string>("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fetchErr, setFetchErr] = useState(false);
  const [basket, setBasket] = useState<Record<string, BasketLine>>({});
  const [basketOpen, setBasketOpen] = useState(false);
  const [rail, setRail] = useState<Item[]>([]);
  const [cdCart, setCdCart] = useState<{ n: number; total: number }>({ n: 0, total: 0 });
  const [sheetIssues, setSheetIssues] = useState<Record<string, { type: string; stock: number }>>({});

  useEffect(() => {
    if (!basketOpen || !store || basketList.length === 0) { setSheetIssues({}); return; }
    (async () => {
      try {
        const skus = basketList.map((l) => l.sku).join(",");
        const j = await (await fetch(`/api/tbs/stock?store=${encodeURIComponent(store)}&skus=${encodeURIComponent(skus)}`, { cache: "no-store" })).json();
        if (!j?.ok || !Array.isArray(j.items)) return;
        const bySku = new Map(j.items.map((x: any) => [String(x.sku), x]));
        const stockLive = j.items.some((x: any) => x.stockLive);
        const next: Record<string, { type: string; stock: number }> = {};
        for (const l of basketList) {
          const x: any = bySku.get(l.sku);
          if (!x || !(Number(x.price) > 0)) { next[l.sku] = { type: "gone", stock: 0 }; continue; }
          if (stockLive) {
            const st = Math.max(0, Number(x.stock) || 0);
            if (st <= 0) next[l.sku] = { type: "out", stock: 0 };
            else if (st < l.qty) next[l.sku] = { type: "short", stock: st };
          }
        }
        setSheetIssues(next);
      } catch { /* keep */ }
    })();
    // recompute whenever the basket itself changes so fixing a flagged line
    // clears the warning + unblocks checkout immediately
  }, [basketOpen, store, Object.values(basket).map((l) => `${l.sku}:${l.qty}`).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const readCd = () => {
      try {
        const c = getCart();
        const boxes = Array.isArray(c?.boxes) ? c.boxes : [];
        let n = 0, total = 0;
        for (const b of boxes) for (const it of (b.items || [])) { n += it.quantity || 0; total += (it.price || 0) * (it.quantity || 0); }
        setCdCart({ n, total });
      } catch { setCdCart({ n: 0, total: 0 }); }
    };
    readCd();
    window.addEventListener("focus", readCd);
    return () => window.removeEventListener("focus", readCd);
  }, [basketOpen]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stores (once the gate opens)
  useEffect(() => {
    if (gate !== "open") return;
    (async () => {
      try {
        const s = await (await fetch("/api/tbs/stores", { cache: "no-store" })).json();
        const list: Store[] = s?.stores || [];
        setStores(list);
        setStockSynced(Boolean(s?.stockSynced));
        const saved = localStorage.getItem("tbs_store") || "";
        if (saved && list.some((x) => x.code === saved)) {
          setStore(saved);
          setBasket(loadBasket(saved));
        } else {
          setPickerOpen(true);
        }
      } catch { /* fallback stores handled server-side */ }
    })();
  }, [gate]);

  const fetchCatalog = useCallback(async (storeCode: string, category: string, query: string, offset: number, append: boolean) => {
    if (!storeCode) return;
    setLoading(true);
    try {
      const p = new URLSearchParams({ store: storeCode, limit: "24", offset: String(offset) });
      if (category) p.set("category", category);
      if (query) p.set("q", query);
      const j = await (await fetch(`/api/tbs/catalog?${p}`, { cache: "no-store" })).json();
      if (j?.ok) {
        setFetchErr(false);
        setTotal(j.total || 0);
        if (!category && !query) setCats(j.categories || []);
        setItems((prev) => (append ? [...prev, ...(j.items || [])] : j.items || []));
      } else setFetchErr(true);
    } catch { setFetchErr(true); } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (store) fetchCatalog(store, cat, q, 0, false); }, [store, cat, fetchCatalog]); // eslint-disable-line react-hooks/exhaustive-deps

  // Best-sellers rail (kurly.com/main-style horizontal strip)
  useEffect(() => {
    if (!store) return;
    (async () => {
      try {
        const j = await (await fetch(`/api/tbs/catalog?store=${encodeURIComponent(store)}&limit=10&sort=popular`, { cache: "no-store" })).json();
        if (j?.ok) setRail(j.items || []);
      } catch { /* rail is optional */ }
    })();
  }, [store]);

  const onSearch = (v: string) => {
    setQ(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchCatalog(store, cat, v, 0, false), 350);
  };

  const pickStore = (code: string) => {
    if (store && code !== store && Object.keys(basket).length > 0) {
      if (!window.confirm("Switching store clears your basket (prices & stock differ per store). Continue?")) return;
      setBasket({}); saveBasket(code, {});
    } else {
      setBasket(loadBasket(code));
    }
    localStorage.setItem("tbs_store", code);
    try { window.dispatchEvent(new Event("tbs-store")); } catch { /* ignore */ }
    setStore(code); setCat(""); setQ(""); setPickerOpen(false);
  };

  // Sheet lines are BasketLines (no live stock field) — adjust them by sku,
  // capped at the stock the issue check reported. add() is for catalog items.
  const setSheetQty = (sku: string, qty: number) => {
    setBasket((prev) => {
      const next = { ...prev };
      const cap = sheetIssues[sku]?.type === "short" ? Math.max(1, sheetIssues[sku].stock) : 99;
      const n = Math.min(cap, Math.round(Number(qty) || 0));
      if (n <= 0) delete next[sku];
      else if (next[sku]) next[sku] = { ...next[sku], qty: n };
      saveBasket(store, next);
      return next;
    });
  };

  const add = (it: Item, delta: number) => {
    setBasket((prev) => {
      const cap = it.status === "in_stock" && Number.isFinite(Number(it.stock)) ? Math.max(0, Number(it.stock)) : 99;
      const cur = prev[it.sku]?.qty || 0;
      const qty = Math.max(0, Math.min(Math.min(99, Math.max(1, cap)), cur + delta));
      const next = { ...prev };
      if (qty === 0) delete next[it.sku];
      else next[it.sku] = { sku: it.sku, name: it.name, price: it.price, unit: it.unit, qty };
      saveBasket(store, next);
      return next;
    });
  };

  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).get("pick") === "1") setPickerOpen(true); } catch { /* ignore */ }
    const open = () => setBasketOpen(true);
    const openPicker = () => setPickerOpen(true);
    window.addEventListener("tbs-open-basket", open);
    window.addEventListener("tbs-open-picker", openPicker);
    return () => { window.removeEventListener("tbs-open-basket", open); window.removeEventListener("tbs-open-picker", openPicker); };
  }, []);

  const basketList = useMemo(() => Object.values(basket), [basket]);
  const basketCount = basketList.reduce((n, l) => n + l.qty, 0);
  // keep the floating WhatsApp bubble above the fixed basket bar
  useEffect(() => {
    if (basketCount > 0) document.documentElement.style.setProperty("--cd-bottombar-h", "68px");
    else document.documentElement.style.removeProperty("--cd-bottombar-h");
    return () => { document.documentElement.style.removeProperty("--cd-bottombar-h"); };
  }, [basketCount > 0]); // eslint-disable-line react-hooks/exhaustive-deps


  const basketTotal = basketList.reduce((n, l) => n + l.qty * l.price, 0);
  const storeName = stores.find((s) => s.code === store)?.name || store;

  if (gate === "loading") return <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "#888" }}>Loading…</main>;
  if (gate === "hidden") return <ComingSoon />;

  return (
    <main style={{ minHeight: "100vh", background: CREAM }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "18px 14px 120px" }}>

        {preview ? (
          <div style={{ background: "#FFF6E5", border: "1px solid #F0DCA8", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, color: "#7a5c00", fontWeight: 700, marginBottom: 12 }}>
            👁️ Preview mode — only you (admin) can see this page. Customers see it after launch.
          </div>
        ) : null}

        {/* hero (mockup-inspired) */}
        <section style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 18, padding: "26px 22px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 300px", minWidth: 260 }}>
            <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.15, fontWeight: 900, color: "#191919", textTransform: "uppercase" }}>
              Curated with <span style={{ color: RED }}>expertise</span>,<br />delivering to <span style={{ color: GREEN }}>you</span>.
            </h1>
            <p style={{ color: "#666", fontSize: 14, lineHeight: 1.6, margin: "10px 0 16px", maxWidth: 420 }}>
              Premium imported and local products, handpicked for quality, freshness, and your everyday needs.
            </p>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <a href="#tbs-shop" style={{ textDecoration: "none", background: "#7CB342", color: "#fff", fontWeight: 900, fontSize: 14, padding: "12px 22px", borderRadius: 8, letterSpacing: 0.5 }}>SHOP NOW</a>
              <button onClick={() => setPickerOpen(true)} style={{ border: `1.5px solid ${GREEN}`, background: "#fff", color: GREEN, borderRadius: 999, padding: "10px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                📍 {store ? storeName : "Choose your store"}
              </button>
            </div>
          </div>
          <div style={{ flex: "0 0 auto" }}><img src="/tbs/logo.png" alt="TotalBuahStore" style={{ height: 130, width: "auto" }} /></div>
        </section>

        {/* quality strip */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 12 }}>
          {[["🏅", "Quality guaranteed", "We source only the best for you and your family."],
            ["🚚", "Pickup & delivery", "Collect at your store or get it sent to your door."],
            ["🎧", "Expert support", "Our team is here to help you shop with confidence."]].map(([e, t, d]) => (
            <div key={t} style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, padding: "12px 14px", display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 22 }}>{e}</span>
              <div><div style={{ fontWeight: 800, fontSize: 13, color: "#222" }}>{t}</div>
                <div style={{ fontSize: 11.5, color: "#888", lineHeight: 1.4 }}>{d}</div></div>
            </div>
          ))}
        </section>

        {!stockSynced && store ? (
          <div style={{ marginTop: 10, fontSize: 12, color: "#8a6d3b", background: "#FCF8E3", border: "1px solid #efe4bb", borderRadius: 8, padding: "6px 10px" }}>
            Live stock is still syncing from the stores — availability shown may lag.
          </div>
        ) : null}

        {/* search + categories */}
        <div style={{ marginTop: 14 }}>
          <input value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Search fruit, snacks, groceries…"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.14)", fontSize: 15, background: "#fff" }} />
          {!cat && !q && rail.length ? (
            <div style={{ marginTop: 16 }}>
              <h2 style={{ margin: "0 0 10px", fontSize: 17, fontWeight: 900, color: "#191919", textTransform: "uppercase", letterSpacing: 0.4 }}>⭐ Best sellers</h2>
              <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6, WebkitOverflowScrolling: "touch" }}>
                {rail.map((it) => (
                  <TbsProductCard key={`rail-${it.sku}`} it={it as any} inBasket={basket[it.sku]?.qty || 0} onAdd={(x, d) => add(x as any, d)} width={150} />
                ))}
              </div>
            </div>
          ) : null}

          {!cat && !q ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "#191919", textTransform: "uppercase", letterSpacing: 0.4 }}>Shop by category</h2>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 12, padding: "12px 2px 6px" }}>
                {cats.map((c) => c.id ? (
                  <Link key={c.id} href={`/tbs/c/${encodeURIComponent(c.id)}`} style={{ textDecoration: "none", textAlign: "center" }}>
                    <span style={{ display: "grid", placeItems: "center", width: 72, height: 72, margin: "0 auto", borderRadius: "50%", background: "#fff", border: "1px solid rgba(0,0,0,0.08)", fontSize: 30, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>{catEmoji(c.id)}</span>
                    <span style={{ display: "block", marginTop: 7, fontSize: 11.5, fontWeight: 800, color: "#333", lineHeight: 1.25 }}>{catLabel(c.id)}</span>
                  </Link>
                ) : null)}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 7, overflowX: "auto", padding: "10px 0 2px", WebkitOverflowScrolling: "touch" }}>
              <button onClick={() => setCat("")} style={{ flex: "0 0 auto", border: "none", borderRadius: 999, padding: "7px 13px", fontWeight: 800, fontSize: 13, cursor: "pointer", background: !cat ? RED : "#fff", color: !cat ? "#fff" : "#444", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>All</button>
              {cats.map((c) => c.id ? (
                <button key={c.id} onClick={() => setCat(c.id!)} style={{ flex: "0 0 auto", border: "none", borderRadius: 999, padding: "7px 13px", fontWeight: 800, fontSize: 13, cursor: "pointer", background: cat === c.id ? RED : "#fff", color: cat === c.id ? "#fff" : "#444", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", whiteSpace: "nowrap" }}>
                  {catLabel(c.id)} <span style={{ opacity: 0.6, fontWeight: 700 }}>{c.count}</span>
                </button>
              ) : null)}
            </div>
          )}
        </div>

        <h2 id="tbs-shop" style={{ margin: "18px 0 0", fontSize: 17, fontWeight: 900, color: "#191919", textTransform: "uppercase", letterSpacing: 0.4 }}>
          {q ? `Results for “${q}”` : cat ? catLabel(cat) : "Featured products"}
        </h2>

        {/* product grid */}
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
          {items.map((it) => (
            <TbsProductCard key={it.sku} it={it as any} inBasket={basket[it.sku]?.qty || 0} onAdd={(x, d) => add(x as any, d)} />
          ))}
        </div>

        {loading ? <p style={{ textAlign: "center", color: "#999", marginTop: 16 }}>Loading…</p> : null}
        {!loading && items.length < total ? (
          <button onClick={() => fetchCatalog(store, cat, q, items.length, true)}
            style={{ display: "block", margin: "16px auto 0", border: `1.5px solid ${RED}`, background: "#fff", color: RED, borderRadius: 999, padding: "10px 22px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
            Load more ({items.length} of {total})
          </button>
        ) : null}
        {!loading && store && fetchErr && items.length === 0 ? (
          <div style={{ textAlign: "center", marginTop: 24 }}>
            <p style={{ color: "#777", fontSize: 14 }}>The store is unreachable right now — it may be waking up.</p>
            <button onClick={() => fetchCatalog(store, cat, q, 0, false)}
              style={{ border: `1.5px solid ${RED}`, background: "#fff", color: RED, borderRadius: 999, padding: "10px 22px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
              Try again
            </button>
          </div>
        ) : null}
        {!loading && store && !fetchErr && items.length === 0 ? <p style={{ textAlign: "center", color: "#999", marginTop: 24 }}>Nothing found{q ? ` for “${q}”` : ""}.</p> : null}

        {/* store picker sheet */}
        {pickerOpen ? (
          <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "end center" }} onClick={() => store && setPickerOpen(false)}>
            <div style={{ width: "min(520px, 100%)", background: "#fff", borderRadius: "18px 18px 0 0", padding: "18px 16px 26px" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <TbsCherry size={26} />
                <div style={{ fontWeight: 900, fontSize: 17, color: GREEN }}>Choose your TotalBuahStore</div>
              </div>
              <p style={{ fontSize: 13, color: "#777", margin: "4px 0 12px" }}>Prices, stock and pickup/delivery come from this store.</p>
              <div style={{ display: "grid", gap: 8 }}>
                {stores.map((s) => (
                  <button key={s.code} onClick={() => pickStore(s.code)}
                    style={{ textAlign: "left", border: store === s.code ? `2px solid ${GREEN}` : "1px solid rgba(0,0,0,0.12)", background: store === s.code ? "#F0F7EE" : "#fff", borderRadius: 12, padding: "12px 14px", cursor: "pointer" }}>
                    <div style={{ fontWeight: 800, color: "#222" }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{s.city || ""}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/* basket bar + sheet */}
        {basketCount > 0 ? (
          <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60, padding: "10px 14px calc(10px + env(safe-area-inset-bottom))", background: "transparent", display: "grid", placeItems: "center" }}>
            <button onClick={() => setBasketOpen(true)} style={{ width: "min(560px, 100%)", border: "none", background: RED, color: "#fff", borderRadius: 14, padding: "14px 18px", fontWeight: 900, fontSize: 15, cursor: "pointer", display: "flex", justifyContent: "space-between", boxShadow: "0 8px 26px rgba(0,0,0,0.25)" }}>
              <span>🧺 {basketCount} item{basketCount > 1 ? "s" : ""}</span>
              <span>{rp(basketTotal)} ›</span>
            </button>
          </div>
        ) : null}

        {/* TBS rewards band (links to the Member page's TBS tab) */}
        <section style={{ marginTop: 26, background: RED, borderRadius: 16, color: "#fff", padding: "20px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, letterSpacing: 0.4 }}>TBS REWARDS</div>
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 3 }}>Belanja lebih hemat dengan poin di setiap transaksi.</div>
          </div>
          <a href="/account" style={{ textDecoration: "none", background: "#7CB342", color: "#fff", fontWeight: 900, fontSize: 13, padding: "11px 18px", borderRadius: 8, letterSpacing: 0.5 }}>GABUNG SEKARANG</a>
        </section>
        <p style={{ textAlign: "center", color: "#999", fontSize: 11.5, marginTop: 18 }}>
          TotalBuahStore · 100% Fresh. Today and Always · part of the Cookie Doh × TBS family
        </p>

        {basketOpen ? (
          <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "end center" }} onClick={() => setBasketOpen(false)}>
            <div style={{ width: "min(560px, 100%)", maxHeight: "80vh", overflowY: "auto", background: "#fff", borderRadius: "18px 18px 0 0", padding: "18px 16px 26px" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontWeight: 900, fontSize: 17, color: GREEN, marginBottom: 2 }}>Your basket — {storeName}</div>
              <div style={{ fontSize: 12.5, color: "#888", marginBottom: 12 }}>Pickup or delivery from this store.</div>
              {basketList.length === 0 ? (
                <div style={{ textAlign: "center", padding: "18px 0 6px" }}>
                  <div style={{ fontSize: 34 }}>🧺</div>
                  <p style={{ color: "#777", fontSize: 14, margin: "8px 0 14px" }}>Your basket is empty — add something fresh!</p>
                  <button onClick={() => setBasketOpen(false)} style={{ border: "none", background: "#7CB342", color: "#fff", borderRadius: 12, padding: "12px 26px", fontWeight: 900, fontSize: 14, cursor: "pointer" }}>Browse the shop</button>
                </div>
              ) : null}
              {basketList.map((l) => (
                <div key={l.sku} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "9px 0", borderTop: "1px solid rgba(0,0,0,0.07)" }}>
                  <div style={{ minWidth: 0, opacity: sheetIssues[l.sku] && sheetIssues[l.sku].type !== "short" ? 0.55 : 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "#222" }}>{l.name}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{rp(l.price)} / {l.unit}</div>
                    {sheetIssues[l.sku] ? (
                      <div style={{ fontSize: 12, color: "#b3261e", fontWeight: 800, marginTop: 2 }}>
                        {sheetIssues[l.sku].type === "short" ? `Only ${sheetIssues[l.sku].stock} left — reduce quantity` : "Out of stock — please remove"}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
                    <button onClick={() => setSheetQty(l.sku, l.qty - 1)} aria-label="less" style={{ border: `1px solid ${GREEN}`, background: "#fff", color: GREEN, borderRadius: 999, width: 28, height: 28, flex: "0 0 auto", fontWeight: 900, cursor: "pointer" }}>−</button>
                    <span style={{ fontWeight: 900, minWidth: 16, textAlign: "center" }}>{l.qty}</span>
                    <button onClick={() => setSheetQty(l.sku, l.qty + 1)} aria-label="more"
                      disabled={Boolean(sheetIssues[l.sku] && sheetIssues[l.sku].type !== "short")}
                      style={{ border: "none", background: sheetIssues[l.sku] && sheetIssues[l.sku].type !== "short" ? "#ccc" : GREEN, color: "#fff", borderRadius: 999, width: 28, height: 28, flex: "0 0 auto", fontWeight: 900, cursor: "pointer" }}>+</button>
                  </div>
                </div>
              ))}
              {basketList.length > 0 ? (<>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: "2px solid rgba(0,0,0,0.1)", fontWeight: 900, fontSize: 15 }}>
                <span>Total</span><span style={{ color: RED }}>{rp(basketTotal)}</span>
              </div>
              {cdCart.n > 0 ? (
                <Link href="/cart" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, textDecoration: "none", background: "#EEF1FB", border: "1px solid rgba(0,20,167,0.18)", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                  <span style={{ fontSize: 13, color: "#0014A7", fontWeight: 700 }}>🍪 Cookie Doh cart · {cdCart.n} item{cdCart.n > 1 ? "s" : ""}</span>
                  <span style={{ fontSize: 13, color: "#0014A7", fontWeight: 700 }}>{rp(cdCart.total)} ›</span>
                </Link>
              ) : null}
              {Object.keys(sheetIssues).length ? (
                <div style={{ background: "#FBECEA", border: "1px solid #ECC9C5", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, color: "#8c1d18", fontWeight: 700, marginBottom: 10 }}>
                  ⚠️ Fix the flagged items (remove or reduce) to continue to checkout.
                </div>
              ) : null}
              <a href={Object.keys(sheetIssues).length ? undefined : (cdCart.n > 0 ? "/cart" : "/tbs/checkout")}
                 onClick={(e) => { if (Object.keys(sheetIssues).length) e.preventDefault(); }}
                 style={{ display: "block", textAlign: "center", textDecoration: "none", width: "100%", border: "none", background: Object.keys(sheetIssues).length ? "#ddd" : "#7CB342", color: Object.keys(sheetIssues).length ? "#999" : "#fff", borderRadius: 12, padding: "14px", fontWeight: 900, fontSize: 15, cursor: Object.keys(sheetIssues).length ? "default" : "pointer" }}>
                {cdCart.n > 0 ? `Checkout together — ${rp(basketTotal + cdCart.total)}` : `Checkout — ${rp(basketTotal)}`}
              </a>
              <p style={{ fontSize: 11.5, color: "#999", textAlign: "center", marginTop: 8 }}>{cdCart.n > 0 ? "One payment — cookies & groceries ship together" : `Pickup or delivery from ${storeName} · QRIS & cards`}</p>
              </>) : null}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
