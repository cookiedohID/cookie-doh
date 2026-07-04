"use client";

// web/app/tbs/c/[cat]/page.tsx — TotalBuahStore category page
// (kurly.com/categories-style): title, item count, sort control, wrapped grid.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  RED, GREEN, CREAM, catLabel, catEmoji, loadBasket, bumpBasket, useTbsGate,
  ComingSoon, TbsProductCard, type CatalogItem, type BasketLine,
} from "../../shared";

const SORTS = [
  { id: "popular", label: "Recommended" },
  { id: "price_asc", label: "Price: low → high" },
  { id: "price_desc", label: "Price: high → low" },
];

export default function TbsCategoryPage() {
  const { gate, preview } = useTbsGate();
  const params = useParams<{ cat: string }>();
  const cat = decodeURIComponent(String(params?.cat || ""));
  const [store, setStore] = useState("");
  const [sort, setSort] = useState("popular");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fetchErr, setFetchErr] = useState(false);
  const [basket, setBasket] = useState<Record<string, BasketLine>>({});

  useEffect(() => {
    const st = localStorage.getItem("tbs_store") || "TBS-RCV";
    setStore(st);
    setBasket(loadBasket(st));
    const refresh = () => setBasket(loadBasket(st));
    window.addEventListener("tbs-basket", refresh);
    return () => window.removeEventListener("tbs-basket", refresh);
  }, []);

  const fetchPage = useCallback(async (offset: number, append: boolean) => {
    if (!store || !cat) return;
    setLoading(true);
    try {
      const p = new URLSearchParams({ store, category: cat, sort, limit: "24", offset: String(offset) });
      const j = await (await fetch(`/api/tbs/catalog?${p}`, { cache: "no-store" })).json();
      if (j?.ok) {
        setFetchErr(false);
        setTotal(j.total || 0);
        setItems((prev) => (append ? [...prev, ...(j.items || [])] : j.items || []));
      } else setFetchErr(true);
    } catch { setFetchErr(true); } finally { setLoading(false); }
  }, [store, cat, sort]);

  useEffect(() => { fetchPage(0, false); }, [fetchPage]);

  const onAdd = (it: CatalogItem, delta: number) => { bumpBasket(store, it, delta); setBasket(loadBasket(store)); };

  if (gate === "loading") return <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "#888" }}>Loading…</main>;
  if (gate === "hidden") return <ComingSoon />;

  return (
    <main style={{ minHeight: "100vh", background: CREAM }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "16px 14px 120px" }}>
        {preview ? (
          <div style={{ background: "#FFF6E5", border: "1px solid #F0DCA8", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, color: "#7a5c00", fontWeight: 700, marginBottom: 12 }}>
            👁️ Preview mode — customers see this after launch.
          </div>
        ) : null}

        <nav style={{ fontSize: 12.5, color: "#999", marginBottom: 8 }}>
          <Link href="/tbs" style={{ color: "#999", textDecoration: "none" }}>Shop</Link> · <b style={{ color: GREEN }}>{catLabel(cat)}</b>
        </nav>

        <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
          <div style={{ fontSize: 34 }}>{catEmoji(cat)}</div>
          <h1 style={{ margin: "4px 0 2px", fontSize: 22, fontWeight: 900, color: "#191919" }}>{catLabel(cat)}</h1>
          <div style={{ fontSize: 12.5, color: "#999" }}>{total} products</div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", margin: "8px 0 10px" }}>
          <select value={sort} onChange={(e) => setSort(e.target.value)}
            style={{ border: "1px solid rgba(0,0,0,0.14)", borderRadius: 10, padding: "8px 11px", fontSize: 13, background: "#fff", color: "#333" }}>
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
          {items.map((it) => (
            <TbsProductCard key={it.sku} it={it} inBasket={basket[it.sku]?.qty || 0} onAdd={onAdd} />
          ))}
        </div>

        {loading ? <p style={{ textAlign: "center", color: "#999", marginTop: 16 }}>Loading…</p> : null}
        {!loading && items.length < total ? (
          <button onClick={() => fetchPage(items.length, true)}
            style={{ display: "block", margin: "16px auto 0", border: `1.5px solid ${RED}`, background: "#fff", color: RED, borderRadius: 999, padding: "10px 22px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
            Load more ({items.length} of {total})
          </button>
        ) : null}
        {!loading && fetchErr && items.length === 0 ? (
          <div style={{ textAlign: "center", marginTop: 24 }}>
            <p style={{ color: "#777", fontSize: 14 }}>The store is unreachable right now — it may be waking up.</p>
            <button onClick={() => fetchPage(0, false)}
              style={{ border: `1.5px solid ${RED}`, background: "#fff", color: RED, borderRadius: 999, padding: "10px 22px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
              Try again
            </button>
          </div>
        ) : null}
        {!loading && !fetchErr && items.length === 0 ? <p style={{ textAlign: "center", color: "#999", marginTop: 24 }}>Nothing in stock here right now.</p> : null}
      </div>
    </main>
  );
}
