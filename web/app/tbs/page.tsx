"use client";

// web/app/tbs/page.tsx — TotalBuahStore catalogue in the owner's approved
// totalbuahstore.com design (2026-10-27): intro banner, category sidebar with
// counts, subcategory + sort filters, 3-up product cards with the hero photo,
// "Harga untuk <unit>", "Bundle hemat hingga 5%", load-more. Content comes from
// the product master (CD db); price/stock for the chosen store are live from
// the ERP where it sells the SKU.
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTbsGate, ComingSoon, tbsFetch } from "./shared";
import { Icon, useTbsStore, type TbsCategory } from "./design/Chrome";
import type { CardItem } from "@/lib/tbsContent";

const PAGE = 36;
const rp = (n: number) => "Rp " + Number(n || 0).toLocaleString("id-ID");

export default function TbsCatalogPage() {
  return <Suspense fallback={<main className="catalog-wrap"><p style={{ padding: 40, color: "var(--muted)" }}>Memuat katalog…</p></main>}><Catalog /></Suspense>;
}

function Catalog() {
  const { gate } = useTbsGate();
  const { store } = useTbsStore();
  const router = useRouter();
  const sp = useSearchParams();
  const category = sp.get("category") || "";
  const sub = sp.get("sub") || "";
  const q = sp.get("q") || "";
  const sort = sp.get("sort") || "default";
  const [search, setSearch] = useState(q);
  const [cats, setCats] = useState<TbsCategory[]>([]);
  const [items, setItems] = useState<CardItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setParam = (patch: Record<string, string>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    router.replace(`/tbs${p.toString() ? `?${p}` : ""}`, { scroll: false });
  };

  const load = useCallback(async (offset: number, append: boolean) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (store) p.set("store", store);
      if (category) p.set("category", category);
      if (sub) p.set("sub", sub);
      if (q) p.set("q", q);
      if (sort === "price") p.set("sort", "price_asc");
      const j = await (await tbsFetch(`/api/tbs/content/catalog?${p}`, { cache: "no-store" })).json();
      if (!j?.ok) { setErr(true); return; }
      setErr(false);
      setTotal(j.total || 0);
      setCats(j.categories || []);
      setItems((prev) => (append ? [...prev, ...(j.items || [])] : j.items || []));
    } catch { setErr(true); } finally { setLoading(false); }
  }, [store, category, sub, q, sort]);

  useEffect(() => { if (gate === "open") load(0, false); }, [gate, load]);
  useEffect(() => { setSearch(q); }, [q]);

  const onSearch = (v: string) => {
    setSearch(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setParam({ q: v.trim() }), 350);
  };

  if (gate === "loading") return <main className="catalog-wrap"><p style={{ padding: 40, color: "var(--muted)" }}>Memuat…</p></main>;
  if (gate === "hidden") return <ComingSoon />;

  const cat = cats.find((c) => c.code === category) || null;
  const allCount = cats.reduce((n, c) => n + (c.count || 0), 0);

  return (
    <main className="catalog-wrap">
      <section className="catalog-intro">
        <div>
          <span className="eyebrow">JELAJAHI TOTALBUAHSTORE.COM</span>
          <h1>Banyak pilihan.<br /><span>Banyak cerita.</span></h1>
          <p>Dari buah favorit hingga kebutuhan sehari-hari.</p>
        </div>
        <div className="intro-art" aria-hidden="true">
          <span><Icon id="fruit" cls="category-icon" sheet="tbs" /></span>
          <span><Icon id="bowl" cls="category-icon" sheet="tbs" /></span>
          <span><Icon id="leaf" cls="category-icon" sheet="tbs" /></span>
        </div>
      </section>

      <div className="catalog-topline">
        <p id="catalogSummary">{allCount ? `${allCount} produk TBS · Pilihan unit & bundle dalam satu halaman` : "Memuat katalog…"}</p>
        <label className="catalog-search">
          <span aria-hidden="true">⌕</span><span className="sr-only">Cari produk atau SKU</span>
          <input id="search" type="search" placeholder="Cari produk atau SKU…" autoComplete="off" value={search} onChange={(e) => onSearch(e.target.value)} />
        </label>
      </div>

      <div className="catalog-layout">
        <aside className="catalog-sidebar" aria-label="Kategori produk">
          <h2>Kategori</h2>
          <div id="categoryList">
            <button type="button" className={!category ? "selected" : ""} aria-pressed={!category} onClick={() => setParam({ category: "", sub: "" })}>
              <span aria-hidden="true">✦</span><span>Semua produk</span>
            </button>
            {cats.map((c) => (
              <button key={c.code} type="button" className={category === c.code ? "selected" : ""} aria-pressed={category === c.code} onClick={() => setParam({ category: c.code, sub: "" })}>
                <span aria-hidden="true"><Icon id={c.icon_id || "sparkles"} cls="category-icon" sheet="tbs" /></span>
                <span>{c.name}</span><small>{c.count || "—"}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="catalog-results" aria-labelledby="categoryTitle">
          <div className="mobile-category">
            <label htmlFor="categorySelect">Kategori
              <select id="categorySelect" value={category} onChange={(e) => setParam({ category: e.target.value, sub: "" })}>
                <option value="">Semua kategori</option>
                {cats.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <div className="category-heading">
            <span id="categoryIcon" aria-hidden="true">{cat ? <Icon id={cat.icon_id || "sparkles"} cls="category-icon" sheet="tbs" /> : "✦"}</span>
            <div>
              <h2 id="categoryTitle">{q ? `Hasil untuk “${q}”` : cat?.name || "Semua produk"}</h2>
              <p id="resultCount" aria-live="polite">{total} produk TBS</p>
            </div>
          </div>
          <div className="catalog-filters">
            <label>Subkategori
              <select id="subcategorySelect" value={sub} disabled={!cat} onChange={(e) => setParam({ sub: e.target.value })}>
                <option value="">Semua subkategori</option>
                {(cat?.subcategories || []).map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </label>
            <label>Urutkan
              <select id="sortOrder" value={sort === "price" ? "price" : "default"} onChange={(e) => setParam({ sort: e.target.value === "price" ? "price" : "" })}>
                <option value="default">Nama A–Z</option>
                <option value="price">Harga terendah</option>
              </select>
            </label>
          </div>
          <p className="dummy-explainer">Pilih produk untuk melihat pilihan unit dan harga bundle. Ketersediaan mengikuti toko pilihan Anda.</p>

          {err ? <p style={{ color: "var(--action)", fontWeight: 700 }}>Katalog tidak dapat dimuat — coba lagi sebentar.</p> : null}

          <div className="catalog-grid" id="productGrid">
            {items.map((p) => <Card key={p.id} p={p} />)}
          </div>
          <div className="catalog-pagination">
            <p id="shownCount">{items.length ? `Menampilkan ${items.length} dari ${total} produk` : ""}</p>
            {items.length < total ? <button id="loadMore" type="button" disabled={loading} onClick={() => load(items.length, true)}>{loading ? "Memuat…" : "Muat lebih banyak"}</button> : null}
          </div>
          {!loading && !err && items.length === 0 ? (
            <div className="empty-results" id="emptyResults">
              <span aria-hidden="true">⌕</span>
              <h3>Belum ada produk yang cocok.</h3>
              <p>Coba kategori lain atau ubah kata pencarian.</p>
              <button id="resetFilters" type="button" onClick={() => { setSearch(""); router.replace("/tbs"); }}>Lihat semua produk</button>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Card({ p }: { p: CardItem }) {
  const href = `/tbs/p/${encodeURIComponent(p.id)}`;
  return (
    <Link href={href} className="product-card">
      <div className="card-picture">
        {p.image_small ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image_small} alt={p.name} loading="lazy" width={720} height={960} />
        ) : (
          <div className="photo-pending"><span aria-hidden="true">🍃</span><strong>Foto produk<br />segera hadir</strong><small>{p.name}</small></div>
        )}
        {p.status === "out_of_stock" ? <span className="card-tag">Stok habis</span> : null}
      </div>
      <div className="card-copy">
        <span className="card-category">{p.category_name || ""}</span>
        <h3>{p.name}</h3>
        <strong className={`card-price${p.price ? "" : " missing-price"}`}>{p.price ? rp(p.price) : "Harga belum diisi"}</strong>
        <small className="card-unit">{p.family ? `${p.family.count} rasa · ${p.family.flavours.join(" · ")}` : p.primary_unit ? `Harga untuk ${p.primary_unit}` : p.price_source === "live" ? `Harga untuk 1 ${p.unit}` : ""}</small>
        {p.has_bundles ? <span className="bundle-hint">Bundle hemat hingga 5%</span> : null}
        <span className="card-action">Lihat produk <span aria-hidden="true">↗</span></span>
      </div>
    </Link>
  );
}
