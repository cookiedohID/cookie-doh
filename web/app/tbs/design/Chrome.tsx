"use client";

// web/app/tbs/design/Chrome.tsx — the TotalBuahStore page chrome in the owner's
// approved design: header (logo, search, account/saved/cart), red category nav,
// store picker, basket drawer and footer. Markup + class names mirror the
// preview site so ./tbs-design.css styles them unchanged.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { loadBasket, saveBasket, bumpBasket, TBS_FALLBACK_STORES, rp, type BasketLine } from "../shared";
import { useTbsBasket } from "@/components/TbsCartSection";
import { tbsIssueText, tbsIssueDead } from "@/lib/tbsStockCheck";

export type TbsCategory = { code: string; name: string; icon: string; icon_id: string; display_order: number; count?: number; subcategories: { code: string; name: string; order: number }[] };
type Store = { code: string; name: string; city?: string };

export const Icon = ({ id, cls = "shop-icon", sheet = "shop" }: { id: string; cls?: string; sheet?: "shop" | "tbs" }) => (
  <svg className={cls} aria-hidden="true"><use href={`/tbs/${sheet}-icons.svg#${id}`} /></svg>
);

// ---- store context (chosen store drives live price/stock everywhere) -------
type StoreCtx = { store: string; storeName: string; stores: Store[]; pick: (code: string) => void; openPicker: () => void };
const StoreContext = createContext<StoreCtx>({ store: "", storeName: "", stores: [], pick: () => {}, openPicker: () => {} });
export const useTbsStore = () => useContext(StoreContext);

const CatContext = createContext<TbsCategory[]>([]);
export const useTbsCategories = () => useContext(CatContext);

export function TbsChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/tbs";
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>(TBS_FALLBACK_STORES);
  const [store, setStore] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [basketOpen, setBasketOpen] = useState(false);
  const [cats, setCats] = useState<TbsCategory[]>([]);
  const [q, setQ] = useState("");
  const [n, setN] = useState(0);

  useEffect(() => {
    fetch("/api/tbs/stores", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (Array.isArray(j?.stores) && j.stores.length) setStores(j.stores);
    }).catch(() => {});
    fetch("/api/tbs/content/catalog?limit=1", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (j?.ok && Array.isArray(j.categories)) setCats(j.categories);
    }).catch(() => {});
    const readStore = () => setStore(localStorage.getItem("tbs_store") || "");
    readStore();
    const refreshN = () => {
      try {
        const st = localStorage.getItem("tbs_store") || "";
        setN(st ? Object.values(loadBasket(st)).reduce((s, l) => s + l.qty, 0) : 0);
      } catch { setN(0); }
    };
    refreshN();
    const openPicker = () => setPickerOpen(true);
    const openBasket = () => setBasketOpen(true);
    window.addEventListener("tbs-store", readStore);
    window.addEventListener("tbs-basket", refreshN);
    window.addEventListener("tbs-open-picker", openPicker);
    window.addEventListener("tbs-open-basket", openBasket);
    window.addEventListener("focus", refreshN);
    return () => {
      window.removeEventListener("tbs-store", readStore); window.removeEventListener("tbs-basket", refreshN);
      window.removeEventListener("tbs-open-picker", openPicker); window.removeEventListener("tbs-open-basket", openBasket);
      window.removeEventListener("focus", refreshN);
    };
  }, []);
  useEffect(() => { setBasketOpen(false); }, [pathname]);
  // first visit: no store yet → ask (only on shop pages; checkout/success keep whatever they have)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("tbs_store") || "";
    if (!saved && (pathname === "/tbs" || pathname.startsWith("/tbs/p/"))) setPickerOpen(true);
    if (new URLSearchParams(window.location.search).get("pick") === "1") setPickerOpen(true);
  }, [pathname]);

  const pick = useCallback((code: string) => {
    const cur = localStorage.getItem("tbs_store") || "";
    if (cur && cur !== code && Object.keys(loadBasket(cur)).length > 0) {
      if (!window.confirm("Ganti toko akan mengosongkan keranjang. Lanjutkan?")) return;
      saveBasket(code, {});
    }
    localStorage.setItem("tbs_store", code);
    setStore(code); setPickerOpen(false);
    try { window.dispatchEvent(new Event("tbs-store")); } catch { /* ignore */ }
  }, []);

  const storeName = stores.find((s) => s.code === store)?.name || TBS_FALLBACK_STORES.find((s) => s.code === store)?.name || store;
  const ctx = useMemo(() => ({ store, storeName, stores, pick, openPicker: () => setPickerOpen(true) }), [store, storeName, stores, pick]);
  const mainCats = cats.filter((c) => (c.count || 0) > 0 || true);
  const byCode = (code: string) => cats.find((c) => c.code === code);
  const subLink = (cat: string, name: string) => {
    const c = byCode(cat); const s = c?.subcategories.find((x) => x.name.toLowerCase().includes(name.toLowerCase()));
    return s ? `/tbs?category=${cat}&sub=${s.code}` : `/tbs?category=${cat}`;
  };

  return (
    <StoreContext.Provider value={ctx}>
      <CatContext.Provider value={cats}>
        <header className="header">
          <Link className="brand" href="/tbs" aria-label="totalbuahstore.com — katalog produk">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brand-logo" src="/tbs/tbs-logo.png" width={512} height={452} alt="Logo TBS" />
            <span className="brand-wordmark"><span className="brand-name"><span className="brand-fruit">totalbuah</span><span className="brand-domain">store.com</span></span></span>
          </Link>
          <form className="header-search" role="search" onSubmit={(e) => { e.preventDefault(); router.push(`/tbs?q=${encodeURIComponent(q.trim())}`); }}>
            <label className="sr-only" htmlFor="headerSearch">Cari buah segar favoritmu</label>
            <input id="headerSearch" name="q" type="search" placeholder="Cari buah segar favoritmu" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="submit" aria-label="Cari produk"><Icon id="search" /></button>
          </form>
          <div className="header-actions">
            <button type="button" aria-label="Toko pilihan" title={storeName || "Pilih toko"} onClick={() => setPickerOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--brand-green)" }}>
              📍 <span style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{storeName || "Pilih toko"}</span>
            </button>
            <Link href="/account" aria-label="Akun" style={{ display: "inline-flex", padding: 5, color: "inherit" }}><Icon id="user" /></Link>
            <Link href="/" aria-label="Cookie Doh" title="Kembali ke Cookie Doh" style={{ display: "inline-flex", padding: 5, color: "inherit", textDecoration: "none", fontSize: 20 }}>🍪</Link>
            <button type="button" className="header-cart" aria-label="Keranjang belanja" onClick={() => setBasketOpen(true)}>
              <Icon id="cart" /><span id="cartCount" className="cart-count">{n}</span>
            </button>
          </div>
        </header>
        <nav className="nav storefront-nav" aria-label="Navigasi utama">
          <div className="storefront-nav-inner">
            <details className="category-menu">
              <summary>☰ Kategori</summary>
              <div className="category-popover">
                <Link className="all-categories" href="/tbs">Lihat semua kategori →</Link>
                {mainCats.map((c) => (
                  <Link key={c.code} href={`/tbs?category=${c.code}`}><span aria-hidden="true"><Icon id={c.icon_id || "sparkles"} cls="category-icon" sheet="tbs" /></span>{c.name}</Link>
                ))}
              </div>
            </details>
            <Link href="/tbs?sort=popular">Terlaris</Link>
            <Link href="/tbs?promo=1">Promo</Link>
            <Link href="/tbs?category=920">TBS - To Go!</Link>
            <Link href={subLink("908", "lokal")}>Buah Lokal</Link>
            <Link href={subLink("908", "impor")}>Buah Impor</Link>
            <Link href="/tbs?q=paket">Paket Buah</Link>
            <Link className="delivery-promise" href="/tbs#layanan"><Icon id="truck" /><span><strong>Pengiriman Segar</strong><small>Setiap Hari</small></span></Link>
          </div>
        </nav>
        {children}
        <footer className="footer wrap">
          <Link className="brand" href="/tbs" aria-label="totalbuahstore.com — katalog produk">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brand-logo" src="/tbs/tbs-logo.png" width={512} height={452} alt="Logo TBS" />
            <span className="brand-wordmark"><span className="brand-name"><span className="brand-fruit">totalbuah</span><span className="brand-domain">store.com</span></span></span>
          </Link>
          <p>Satu produk. Satu cerita.<br />Disiapkan dengan perhatian.</p>
        </footer>
        {pickerOpen ? <StorePicker stores={stores} current={store} onPick={pick} onClose={() => { if (store) setPickerOpen(false); }} /> : null}
        {basketOpen ? <BasketDrawer onClose={() => setBasketOpen(false)} /> : null}
      </CatContext.Provider>
    </StoreContext.Provider>
  );
}

function StorePicker({ stores, current, onPick, onClose }: { stores: Store[]; current: string; onPick: (c: string) => void; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Pilih toko" onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: "22px 20px", width: "100%", maxWidth: 420 }}>
        <span className="eyebrow">Fresh from TotalBuahStore</span>
        <h2 style={{ margin: "6px 0 4px", fontSize: 22, color: "var(--action)" }}>Pilih toko Anda</h2>
        <p style={{ margin: "0 0 14px", color: "var(--muted)", fontSize: 13 }}>Harga, stok dan pengiriman mengikuti toko pilihan Anda.</p>
        <div style={{ display: "grid", gap: 8 }}>
          {stores.map((s) => (
            <button key={s.code} type="button" onClick={() => onPick(s.code)}
              style={{ textAlign: "left", border: `1px solid ${s.code === current ? "var(--brand-green)" : "var(--border)"}`, background: s.code === current ? "var(--surface-green)" : "#fff", borderRadius: 10, padding: "12px 14px", cursor: "pointer", font: "inherit" }}>
              <strong style={{ display: "block", fontSize: 15 }}>{s.name}</strong>
              {s.city ? <small style={{ color: "var(--muted)" }}>{s.city}</small> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BasketDrawer({ onClose }: { onClose: () => void }) {
  const { store, storeName, lines, subtotal, issues, hasIssues } = useTbsBasket();
  const [, force] = useState(0);
  const change = (l: BasketLine, d: number) => { bumpBasket(store, { sku: l.sku, name: l.name, price: l.price, unit: l.unit }, d); force((x) => x + 1); };
  const remove = (l: BasketLine) => { const b = loadBasket(store); delete b[l.sku]; saveBasket(store, b); force((x) => x + 1); };
  return (
    <div role="dialog" aria-modal="true" aria-label="Keranjang" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.4)" }}>
      <aside onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(420px, 100%)", background: "#fff", display: "flex", flexDirection: "column", boxShadow: "-10px 0 30px rgba(0,0,0,0.15)" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div><strong style={{ fontSize: 17 }}>Keranjang</strong><div style={{ fontSize: 12, color: "var(--muted)" }}>{storeName || "Pilih toko"}</div></div>
          <button type="button" onClick={onClose} aria-label="Tutup" style={{ border: 0, background: "none", fontSize: 24, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "8px 20px" }}>
          {lines.length === 0 ? <p style={{ color: "var(--muted)", padding: "20px 0" }}>Keranjang masih kosong.</p> : lines.map((l) => (
            <div key={l.sku} style={{ display: "flex", gap: 10, padding: "12px 0", borderBottom: "1px solid var(--border-soft)", opacity: tbsIssueDead(issues[l.sku]) ? 0.55 : 1 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, lineHeight: 1.35 }}>{l.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{rp(l.price)} / {l.unit}</div>
                {issues[l.sku] ? <div style={{ fontSize: 12, color: "var(--action)", fontWeight: 700 }}>{tbsIssueText(issues[l.sku])}</div> : null}
                <button type="button" onClick={() => remove(l)} style={{ border: 0, background: "none", color: "var(--muted)", fontSize: 11.5, padding: 0, marginTop: 4, cursor: "pointer", textDecoration: "underline" }}>Hapus</button>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="quantity-control" style={{ display: "inline-flex" }}>
                  <button type="button" onClick={() => change(l, -1)} aria-label="Kurangi">−</button>
                  <input readOnly value={l.qty} aria-label="Jumlah" />
                  <button type="button" onClick={() => change(l, 1)} aria-label="Tambah">+</button>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, marginTop: 6 }}>{rp(l.qty * l.price)}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: "14px 20px 20px", borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, marginBottom: 10 }}><span>Subtotal</span><strong>{rp(subtotal)}</strong></div>
          <Link href="/tbs/checkout" className="add-to-cart" aria-disabled={lines.length === 0 || hasIssues}
            style={{ display: "flex", justifyContent: "center", textDecoration: "none", pointerEvents: lines.length === 0 || hasIssues ? "none" : "auto", opacity: lines.length === 0 || hasIssues ? 0.5 : 1 }}>
            <span>Lanjut ke pembayaran</span>
          </Link>
          <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "8px 0 0", textAlign: "center" }}>Harga dikonfirmasi ulang dari toko saat pembayaran.</p>
        </div>
      </aside>
    </div>
  );
}
