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

const RED = "#9c1216";
const GREEN = "#135232";
const CREAM = "#F7F9F5";

type Store = { code: string; name: string; city?: string; items?: number };
type Item = { sku: string; name: string; category: string | null; price: number; unit: string; weighed: boolean | null; stock: number; status: string };
type Cat = { id: string | null; name: string | null; count: number };
type BasketLine = { sku: string; name: string; price: number; unit: string; qty: number };

const rp = (n: number) => "Rp" + Number(n || 0).toLocaleString("id-ID");

function TbsCherry({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round((size * 30) / 26)} viewBox="0 0 26 30" aria-hidden="true">
      <path d="M12 14 C 12 9, 14 6, 17 4" stroke={GREEN} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M17 4 C 22 1, 25 4, 21 7 C 18 6, 18 6, 17 4 Z" fill="#4aa02c" />
      <circle cx="11" cy="20" r="8" fill="#b0201d" />
      <circle cx="8" cy="17" r="2" fill="#d76b62" />
    </svg>
  );
}

// Deterministic soft tile colour per category (no product photos yet).
function tileColors(cat: string | null): { bg: string; fg: string } {
  const palette = [
    { bg: "#EAF3E7", fg: GREEN }, { bg: "#FBEFEA", fg: RED },
    { bg: "#F3EFE2", fg: "#7a5c00" }, { bg: "#E7F0F3", fg: "#0f5a6e" },
    { bg: "#F0EAF5", fg: "#5b3a80" },
  ];
  let h = 0;
  for (const ch of cat || "x") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

function loadBasket(store: string): Record<string, BasketLine> {
  try {
    const raw = JSON.parse(localStorage.getItem("tbs_basket") || "null");
    if (raw && raw.store === store && raw.items) return raw.items;
  } catch { /* ignore */ }
  return {};
}
function saveBasket(store: string, items: Record<string, BasketLine>) {
  try { localStorage.setItem("tbs_basket", JSON.stringify({ store, items })); } catch { /* ignore */ }
}

export default function TbsShopPage() {
  const [gate, setGate] = useState<"loading" | "hidden" | "open">("loading");
  const [preview, setPreview] = useState(false);
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
  const [basket, setBasket] = useState<Record<string, BasketLine>>({});
  const [basketOpen, setBasketOpen] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Gate + stores
  useEffect(() => {
    (async () => {
      try {
        const g = await (await fetch("/api/tbs/enabled", { cache: "no-store" })).json();
        if (!g?.enabled) { setGate("hidden"); return; }
        setPreview(Boolean(g.preview));
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
        setGate("open");
      } catch { setGate("hidden"); }
    })();
  }, []);

  const fetchCatalog = useCallback(async (storeCode: string, category: string, query: string, offset: number, append: boolean) => {
    if (!storeCode) return;
    setLoading(true);
    try {
      const p = new URLSearchParams({ store: storeCode, limit: "24", offset: String(offset) });
      if (category) p.set("category", category);
      if (query) p.set("q", query);
      const j = await (await fetch(`/api/tbs/catalog?${p}`, { cache: "no-store" })).json();
      if (j?.ok) {
        setTotal(j.total || 0);
        if (!category && !query) setCats(j.categories || []);
        setItems((prev) => (append ? [...prev, ...(j.items || [])] : j.items || []));
      }
    } catch { /* keep whatever is shown */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (store) fetchCatalog(store, cat, q, 0, false); }, [store, cat, fetchCatalog]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setStore(code); setCat(""); setQ(""); setPickerOpen(false);
  };

  const add = (it: Item, delta: number) => {
    setBasket((prev) => {
      const cur = prev[it.sku]?.qty || 0;
      const qty = Math.max(0, Math.min(99, cur + delta));
      const next = { ...prev };
      if (qty === 0) delete next[it.sku];
      else next[it.sku] = { sku: it.sku, name: it.name, price: it.price, unit: it.unit, qty };
      saveBasket(store, next);
      return next;
    });
  };

  const basketList = useMemo(() => Object.values(basket), [basket]);
  const basketCount = basketList.reduce((n, l) => n + l.qty, 0);
  const basketTotal = basketList.reduce((n, l) => n + l.qty * l.price, 0);
  const storeName = stores.find((s) => s.code === store)?.name || store;

  if (gate === "loading") return <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "#888" }}>Loading…</main>;
  if (gate === "hidden") {
    return (
      <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 20 }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <TbsCherry size={44} />
          <h1 style={{ fontSize: 22, fontWeight: 900, color: GREEN, margin: "10px 0 4px" }}>TotalBuahStore is coming soon</h1>
          <p style={{ color: "#6B6B6B", fontSize: 14, lineHeight: 1.6 }}>Fresh fruit & groceries from Total Buah — right here on Cookie Doh. Stay tuned 🍒</p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: CREAM }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "18px 14px 120px" }}>

        {preview ? (
          <div style={{ background: "#FFF6E5", border: "1px solid #F0DCA8", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, color: "#7a5c00", fontWeight: 700, marginBottom: 12 }}>
            👁️ Preview mode — only you (admin) can see this page. Customers see it after launch.
          </div>
        ) : null}

        {/* TBS brand header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <TbsCherry size={38} />
            <div>
              <div style={{ fontSize: 26, fontWeight: 900, color: GREEN, lineHeight: 1, letterSpacing: 0.5 }}>TotalBuahStore</div>
              <div style={{ fontSize: 13, fontStyle: "italic", color: RED, marginTop: 3 }}>100% Fresh. Today and Always</div>
            </div>
          </div>
          <button onClick={() => setPickerOpen(true)} style={{ border: `1.5px solid ${GREEN}`, background: "#fff", color: GREEN, borderRadius: 999, padding: "9px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            📍 {store ? storeName : "Choose your store"}
          </button>
        </div>

        {!stockSynced && store ? (
          <div style={{ marginTop: 10, fontSize: 12, color: "#8a6d3b", background: "#FCF8E3", border: "1px solid #efe4bb", borderRadius: 8, padding: "6px 10px" }}>
            Live stock is still syncing from the stores — availability shown may lag.
          </div>
        ) : null}

        {/* search + categories */}
        <div style={{ marginTop: 14 }}>
          <input value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Search fruit, snacks, groceries…"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.14)", fontSize: 15, background: "#fff" }} />
          <div style={{ display: "flex", gap: 7, overflowX: "auto", padding: "10px 0 2px", WebkitOverflowScrolling: "touch" }}>
            <button onClick={() => setCat("")} style={{ flex: "0 0 auto", border: "none", borderRadius: 999, padding: "7px 13px", fontWeight: 800, fontSize: 13, cursor: "pointer", background: !cat ? RED : "#fff", color: !cat ? "#fff" : "#444", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>All</button>
            {cats.map((c) => c.id ? (
              <button key={c.id} onClick={() => setCat(c.id!)} style={{ flex: "0 0 auto", border: "none", borderRadius: 999, padding: "7px 13px", fontWeight: 800, fontSize: 13, cursor: "pointer", background: cat === c.id ? RED : "#fff", color: cat === c.id ? "#fff" : "#444", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", whiteSpace: "nowrap" }}>
                {c.name} <span style={{ opacity: 0.6, fontWeight: 700 }}>{c.count}</span>
              </button>
            ) : null)}
          </div>
        </div>

        {/* product grid */}
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
          {items.map((it) => {
            const t = tileColors(it.category);
            const inBasket = basket[it.sku]?.qty || 0;
            const out = it.status === "out_of_stock";
            return (
              <div key={it.sku} style={{ background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(0,0,0,0.07)", display: "flex", flexDirection: "column" }}>
                <div style={{ height: 84, background: t.bg, display: "grid", placeItems: "center", position: "relative" }}>
                  <span style={{ fontSize: 26, fontWeight: 900, color: t.fg, opacity: 0.75 }}>
                    {it.name.split(" ").slice(0, 2).map((w) => w[0]).join("")}
                  </span>
                  {out ? <span style={{ position: "absolute", top: 8, right: 8, fontSize: 10.5, fontWeight: 800, background: "#efefef", color: "#777", borderRadius: 999, padding: "2px 8px" }}>out of stock</span> : null}
                  {it.weighed ? <span style={{ position: "absolute", bottom: 8, left: 8, fontSize: 10.5, fontWeight: 800, background: "#fff", color: GREEN, borderRadius: 999, padding: "2px 8px", border: `1px solid ${GREEN}22` }}>±1kg pack</span> : null}
                </div>
                <div style={{ padding: "10px 11px 12px", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#222", lineHeight: 1.35, minHeight: 35 }}>{it.name}</div>
                  <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <div>
                      <div style={{ fontSize: 14.5, fontWeight: 900, color: RED }}>{rp(it.price)}</div>
                      <div style={{ fontSize: 11, color: "#999" }}>per {it.unit}</div>
                    </div>
                    {inBasket === 0 ? (
                      <button disabled={out} onClick={() => add(it, +1)} aria-label={`Add ${it.name}`}
                        style={{ border: "none", borderRadius: 999, width: 34, height: 34, fontWeight: 900, fontSize: 18, cursor: out ? "default" : "pointer", background: out ? "#eee" : GREEN, color: out ? "#aaa" : "#fff" }}>+</button>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button onClick={() => add(it, -1)} style={{ border: `1px solid ${GREEN}`, background: "#fff", color: GREEN, borderRadius: 999, width: 28, height: 28, fontWeight: 900, cursor: "pointer" }}>−</button>
                        <span style={{ fontWeight: 900, color: "#222", minWidth: 16, textAlign: "center" }}>{inBasket}</span>
                        <button onClick={() => add(it, +1)} style={{ border: "none", background: GREEN, color: "#fff", borderRadius: 999, width: 28, height: 28, fontWeight: 900, cursor: "pointer" }}>+</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {loading ? <p style={{ textAlign: "center", color: "#999", marginTop: 16 }}>Loading…</p> : null}
        {!loading && items.length < total ? (
          <button onClick={() => fetchCatalog(store, cat, q, items.length, true)}
            style={{ display: "block", margin: "16px auto 0", border: `1.5px solid ${RED}`, background: "#fff", color: RED, borderRadius: 999, padding: "10px 22px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
            Load more ({items.length} of {total})
          </button>
        ) : null}
        {!loading && store && items.length === 0 ? <p style={{ textAlign: "center", color: "#999", marginTop: 24 }}>Nothing found{q ? ` for “${q}”` : ""}.</p> : null}

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
                    <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{s.city || ""}{s.items ? ` · ${s.items} products in stock` : ""}</div>
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

        {basketOpen ? (
          <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "end center" }} onClick={() => setBasketOpen(false)}>
            <div style={{ width: "min(560px, 100%)", maxHeight: "80vh", overflowY: "auto", background: "#fff", borderRadius: "18px 18px 0 0", padding: "18px 16px 26px" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontWeight: 900, fontSize: 17, color: GREEN, marginBottom: 2 }}>Your basket — {storeName}</div>
              <div style={{ fontSize: 12.5, color: "#888", marginBottom: 12 }}>Pickup or delivery from this store.</div>
              {basketList.map((l) => (
                <div key={l.sku} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "9px 0", borderTop: "1px solid rgba(0,0,0,0.07)" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "#222" }}>{l.name}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{rp(l.price)} / {l.unit}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
                    <button onClick={() => add({ ...(l as any), status: "in_stock" }, -1)} style={{ border: `1px solid ${GREEN}`, background: "#fff", color: GREEN, borderRadius: 999, width: 28, height: 28, fontWeight: 900, cursor: "pointer" }}>−</button>
                    <span style={{ fontWeight: 900, minWidth: 16, textAlign: "center" }}>{l.qty}</span>
                    <button onClick={() => add({ ...(l as any), status: "in_stock" }, +1)} style={{ border: "none", background: GREEN, color: "#fff", borderRadius: 999, width: 28, height: 28, fontWeight: 900, cursor: "pointer" }}>+</button>
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: "2px solid rgba(0,0,0,0.1)", fontWeight: 900, fontSize: 15 }}>
                <span>Total</span><span style={{ color: RED }}>{rp(basketTotal)}</span>
              </div>
              <button disabled style={{ width: "100%", border: "none", background: "#ddd", color: "#888", borderRadius: 12, padding: "14px", fontWeight: 900, fontSize: 15 }}>
                Checkout — arriving in the next update
              </button>
              <p style={{ fontSize: 11.5, color: "#999", textAlign: "center", marginTop: 8 }}>Browsing preview — payment, pickup & delivery are being wired up.</p>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
