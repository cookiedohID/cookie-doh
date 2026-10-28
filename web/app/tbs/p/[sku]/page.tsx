"use client";

// web/app/tbs/p/[sku]/page.tsx — TotalBuahStore product page in the owner's
// approved totalbuahstore.com design (2026-10-27): gallery (hero + thumbs),
// info panel (store, price, availability, unit/bundle picker with "Anda Hemat",
// quantity + total, add to basket), section tabs, story (banner, checkpoints,
// TBS Tip / Note), Inspirasi Sajian (recipes with shoppable ingredients), detail
// image, Informasi produk, Layanan TBS, related products.
// The URL param accepts the sheet's product id, the SKU or the slug.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTbsGate, ComingSoon, loadBasket, saveBasket, type BasketLine } from "../../shared";
import { Icon, useTbsStore } from "../../design/Chrome";
import { bundleKey, bundleLabel, type BundleSize } from "@/lib/tbsBundle";
import type { CardItem } from "@/lib/tbsContent";

const rp = (n: number) => "Rp " + Number(n || 0).toLocaleString("id-ID");
type Img = { role: string; url: string; url_small: string; alt: string };
type Detail = any;

export default function TbsProductPage() {
  const { gate } = useTbsGate();
  const { store, storeName, stores, pick } = useTbsStore();
  const router = useRouter();
  const params = useParams<{ sku: string }>();
  const id = decodeURIComponent(String(params?.sku || ""));
  const [d, setD] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [slot, setSlot] = useState(0);
  const [choice, setChoice] = useState<string>("base"); // base | b5 | b10 | uom:<UOM>
  const [qty, setQty] = useState(1);
  const [feedback, setFeedback] = useState("");
  const [tab, setTab] = useState("cerita");

  useEffect(() => {
    if (gate !== "open" || !id) return;
    (async () => {
      try {
        const j = await (await fetch(`/api/tbs/content/product?id=${encodeURIComponent(id)}${store ? `&store=${encodeURIComponent(store)}` : ""}`, { cache: "no-store" })).json();
        if (j?.ok && j.found) { setD(j); setMissing(false); }
        else setMissing(true);
      } catch { setMissing(true); }
    })();
  }, [gate, id, store]);
  useEffect(() => { setChoice("base"); setQty(1); setSlot(0); }, [id]);

  const p = d?.product;
  const images: Img[] = p?.images || [];
  const hero = images.find((i) => i.role === "hero_portrait") || images[0] || null;
  const banner = images.find((i) => i.role === "landscape_banner") || null;
  const detail = images.find((i) => i.role === "detail") || null;
  const gallery = [hero, banner, detail].filter(Boolean) as Img[];

  const mine = useMemo(() => (d?.live?.availability || []).find((a: any) => a.store === store), [d, store]);
  const sellable = Boolean(d?.sellable);
  const unitPrice: number = d?.pricing?.unit_price || 0;
  const unit: string = d?.pricing?.unit || p?.primary_unit || "pcs";
  const bundles: { size: BundleSize; price: number; full: number; save: number }[] = d?.pricing?.bundles || [];
  const discountLive: boolean = Boolean(d?.pricing?.bundle_discount_live);
  const uoms: { uom: string; factor: number; label: string; price: number; stock: number }[] = (d?.live?.variants || []).filter((v: any) => v.factor > 1);

  // selected option → price per line unit, basket key, display name
  const sel = useMemo(() => {
    if (!p) return null;
    if (choice === "b5" || choice === "b10") {
      const size = (choice === "b5" ? 5 : 10) as BundleSize;
      const b = bundles.find((x) => x.size === size);
      if (!b) return null;
      return { key: bundleKey(p.sku, size), name: `${p.name} — ${bundleLabel(size, unit)}`, price: b.price, full: b.full, save: b.save, unit: "pack", stock: mine ? Math.floor((mine.stock || 0) / size) : null, label: bundleLabel(size, unit) };
    }
    if (choice.startsWith("uom:")) {
      const v = uoms.find((x) => `uom:${x.uom}` === choice);
      if (!v) return null;
      return { key: `${p.sku}@${v.uom}`, name: `${p.name} (${v.label})`, price: v.price, full: v.price, save: 0, unit: "box", stock: v.stock, label: v.label };
    }
    return { key: p.sku, name: p.name, price: unitPrice, full: unitPrice, save: 0, unit, stock: mine ? mine.stock : null, label: p.primary_unit || `1 ${unit}` };
  }, [choice, p, bundles, uoms, unitPrice, unit, mine]);

  const stockKnown = Boolean(mine && mine.status !== "unknown");
  const out = Boolean(sellable && stockKnown && sel && sel.stock !== null && sel.stock < 1);
  const canBuy = sellable && sel && sel.price > 0 && !out && Boolean(store);
  const total = sel ? sel.price * qty : 0;

  const addToBasket = () => {
    if (!canBuy || !sel) return;
    const items = loadBasket(store);
    const cur = items[sel.key]?.qty || 0;
    items[sel.key] = { sku: sel.key, name: sel.name, price: sel.price, unit: sel.unit, qty: Math.min(99, cur + qty) } as BasketLine;
    saveBasket(store, items);
    setFeedback(`${sel.name} × ${qty} ditambahkan ke keranjang.`);
    setTimeout(() => setFeedback(""), 2500);
  };

  if (gate === "loading") return <main className="wrap"><p style={{ padding: 40, color: "var(--muted)" }}>Memuat…</p></main>;
  if (gate === "hidden") return <ComingSoon />;
  if (missing) {
    return (
      <main className="wrap" style={{ padding: "60px 28px", textAlign: "center" }}>
        <p style={{ color: "var(--muted)" }}>Produk tidak ditemukan.</p>
        <Link href="/tbs" style={{ color: "var(--action)", fontWeight: 700 }}>← Kembali ke katalog</Link>
      </main>
    );
  }
  if (!d || !p) return <main className="wrap"><p style={{ padding: 40, color: "var(--muted)" }}>Memuat produk…</p></main>;

  const availText = !sellable ? "Stok dikonfirmasi per toko"
    : !store ? "Pilih toko untuk melihat stok"
    : !stockKnown ? "Stok dikonfirmasi toko"
    : (sel?.stock ?? 0) > 0 ? ((sel?.stock ?? 0) <= 5 ? `Stok tersisa ${sel?.stock}` : "Tersedia") : "Stok habis";
  const availStatus = sellable && stockKnown ? ((sel?.stock ?? 0) > 0 ? "In stock" : "Out of stock") : "Unconfirmed";
  const facts = (d.facts || []) as { kind: string; title: string; description?: string; source_name?: string; source_url?: string }[];
  const benefits = facts.filter((f) => f.kind === "benefit");
  const nutrition = facts.filter((f) => f.kind === "nutrition");
  const blocks = (d.blocks || []) as { block_key: string; section: string; heading: string; body: string }[];
  const groups = groupBlocks(blocks);

  return (
    <main className="wrap">
      <nav className="crumb" aria-label="Breadcrumb">
        <Link href="/tbs" style={{ textDecoration: "none" }}>Katalog</Link><span>/</span>
        {p.category_code ? <><Link href={`/tbs?category=${p.category_code}`} style={{ textDecoration: "none" }}>{p.category_name}</Link><span>/</span></> : null}
        <b>{p.name}</b>
      </nav>

      <section className="product" id="produk">
        <div className="product-gallery">
          <div className="hero-wrap">
            <div className="image-slot hero" data-slot={slot}>
              {gallery[slot] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={gallery[slot].url} alt={gallery[slot].alt || p.name} fetchPriority="high" />
              ) : (
                <div className="missing"><Icon id="leaf" cls="category-icon" sheet="tbs" /><strong>Foto produk segera hadir</strong><small>{p.name}</small></div>
              )}
            </div>
          </div>
          {gallery.length > 1 ? (
            <div className="photo-thumbs" aria-label="Foto produk">
              {gallery.map((g, i) => (
                <button key={g.url} type="button" aria-label={["Lihat foto utama", "Lihat foto suasana", "Lihat detail produk"][i] || "Lihat foto"} aria-pressed={slot === i} onClick={() => setSlot(i)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.url_small || g.url} alt={g.alt || p.name} loading="lazy" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="info">
          <span className="fresh-tag"><Icon id="leaf" /><span>{sellable ? "Pilihan TBS" : "Katalog TBS"}</span></span>
          <h1>{p.name}</h1>
          {p.tagline ? <p className="subtitle">{p.tagline}</p> : null}
          <div className="fresh-from">
            <label htmlFor="selectedStore">Fresh from TotalBuahStore —</label>
            <select id="selectedStore" aria-label="Toko pilihan Anda" value={store} onChange={(e) => e.target.value && pick(e.target.value)}>
              <option value="">Pilih toko</option>
              {stores.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </div>
          <div className="price-box">
            <strong className="price" id="priceView">{sel && sel.price > 0 ? rp(sel.price) : unitPrice > 0 ? rp(unitPrice) : "Harga belum diisi"}</strong>
            {sel && sel.save > 0 ? (
              <span className="savings">Anda Hemat {rp(sel.save)} · <s style={{ color: "var(--muted)" }}>{rp(sel.full)}</s></span>
            ) : null}
          </div>
          <p id="selectedUnit" className="selected-unit">
            {sel ? `Harga untuk ${sel.label}` : ""}{d.pricing?.source === "sheet" ? " · harga daftar TBS, dikonfirmasi toko" : ""}
          </p>
          <dl className="store-facts facts">
            <div className="fact"><dt>Delivery</dt><dd id="storeDelivery">{store ? `Ambil di toko atau antar dari ${storeName} (maks. 12 km).` : "Pilih toko untuk informasi pengiriman."}</dd></div>
            <div className="fact"><dt>Availability</dt><dd className="availability" id="storeAvailability" role="status" data-status={availStatus}><span className="stock-dot" aria-hidden="true"></span><span id="stockText">{availText}</span></dd></div>
          </dl>

          {(bundles.length || uoms.length) && unitPrice > 0 ? (
            <fieldset className="variant-picker" id="variantPicker">
              <legend>Pilih varian</legend>
              <div id="variantOptions" style={{ display: "grid", gap: 8 }}>
                <label className="variant-option">
                  <input type="radio" name="variant" checked={choice === "base"} onChange={() => setChoice("base")} />
                  <span>{p.primary_unit || `1 ${unit}`}</span><strong>{rp(unitPrice)}</strong>
                </label>
                {bundles.map((b) => (
                  <label key={b.size} className="variant-option" data-sold-out={stockKnown && mine && Math.floor((mine.stock || 0) / b.size) < 1 ? "true" : undefined}>
                    <input type="radio" name="variant" checked={choice === `b${b.size}`} onChange={() => setChoice(`b${b.size}`)} />
                    <span>{bundleLabel(b.size, unit)}{b.save > 0 ? <small style={{ display: "block", color: "var(--brand-green)", fontWeight: 700 }}>Anda Hemat {rp(b.save)}</small> : null}</span>
                    <strong>{rp(b.price)}</strong>
                  </label>
                ))}
                {uoms.map((v) => (
                  <label key={v.uom} className="variant-option" data-sold-out={stockKnown && v.stock < 1 ? "true" : undefined}>
                    <input type="radio" name="variant" checked={choice === `uom:${v.uom}`} onChange={() => setChoice(`uom:${v.uom}`)} />
                    <span>{v.label}</span><strong>{rp(v.price)}</strong>
                  </label>
                ))}
              </div>
              {bundles.length && !discountLive ? <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "8px 0 0" }}>Harga bundle mengikuti harga unit toko.</p> : null}
            </fieldset>
          ) : null}

          <div className="quantity-total">
            <div className="quantity-control">
              <button type="button" id="quantityMinus" aria-label="Kurangi jumlah" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
              <label className="sr-only" htmlFor="purchaseQuantity">Jumlah produk</label>
              <input id="purchaseQuantity" type="number" min={1} max={99} step={1} value={qty} inputMode="numeric" onChange={(e) => setQty(Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)))} />
              <button type="button" id="quantityPlus" aria-label="Tambah jumlah" disabled={qty >= 99} onClick={() => setQty((q) => Math.min(99, q + 1))}>+</button>
            </div>
            <div className="purchase-total"><span>Jumlah harga</span><output id="purchaseTotal" htmlFor="purchaseQuantity" aria-live="polite">{total > 0 ? rp(total) : "—"}</output></div>
          </div>
          <div className="purchase-controls">
            <button className="add-to-cart" type="button" id="addToCart" disabled={!canBuy} onClick={addToBasket} style={!canBuy ? { opacity: 0.55, cursor: "not-allowed" } : undefined}>
              <Icon id="cart" /><span>{!sellable ? "Belum dapat dipesan online" : out ? "Stok habis" : !store ? "Pilih toko dulu" : "Tambah ke Keranjang"}</span>
            </button>
            {canBuy ? (
              <button type="button" onClick={() => { addToBasket(); router.push("/tbs/checkout"); }} className="add-to-cart" style={{ background: "#fff", color: "var(--brand-green)", border: "1px solid var(--brand-green)", marginTop: 8 }}>
                <span>Beli sekarang</span>
              </button>
            ) : null}
          </div>
          <p className="shopping-feedback" id="shoppingFeedback" role="status">{feedback}</p>
          {!sellable ? <p className="preview-note">Produk ini belum tersedia di katalog online toko. Hubungi TBS untuk memesan.</p> : null}
          <dl className="facts purchase-facts">
            <div className="fact"><dt>Asal</dt><dd>{p.origin || "Belum diisi"}</dd></div>
            <div className="fact"><dt>Berat</dt><dd>{p.weight_contents || "Belum diisi"}</dd></div>
          </dl>
        </div>
      </section>

      <nav className="tabs" aria-label="Bagian produk">
        {[["cerita", "Deskripsi produk"], ["sajian", "Inspirasi sajian"], ["detail", "Detail gambar"], ["informasi", "Informasi produk"], ["layanan", "Layanan TBS"]].map(([k, label]) => (
          <a key={k} href={`#${k}`} className={tab === k ? "active" : ""} aria-current={tab === k ? "location" : undefined} onClick={() => setTab(k)}>{label}</a>
        ))}
      </nav>

      <section className="story" id="cerita">
        <div className="section-heading">
          <span className="eyebrow">Dari koleksi totalbuahstore.com</span>
          <h2>{p.story_heading || p.name}</h2>
          {p.story_intro ? <p>{p.story_intro}</p> : null}
        </div>
        <div className="image-slot landscape" data-slot="1">
          {banner ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={banner.url} alt={banner.alt || p.name} loading="lazy" />
          ) : <div className="missing"><span className="number">02</span><strong>Cerita dalam satu gambar</strong><small>BANNER · 2:1</small></div>}
        </div>
        {p.description ? <div className="story-copy">{p.description}</div> : null}
        {p.checkpoints?.length ? (
          <section className="product-story-section checkpoints" id="checkpoints">
            <span className="eyebrow">Hal kecil, banyak ide</span>
            <h3>Check Point <span aria-hidden="true">✦</span></h3>
            <ol className="checkpoint-list">
              {p.checkpoints.map((c: string, i: number) => <li key={i}><span className="point-number" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span><p>{c}</p></li>)}
            </ol>
          </section>
        ) : null}
        {p.tip ? <section className="product-story-section tip-section" id="tips"><span className="feature-symbol" aria-hidden="true">✦</span><h3>TBS Tip</h3><p>{p.tip}</p></section> : null}
        {p.note ? <section className="product-story-section note-section"><span className="feature-symbol" aria-hidden="true">♡</span><h3>TBS Note</h3><p>{p.note}</p></section> : null}
      </section>

      <section className="recipe-section" id="sajian">
        <div className="section-heading">
          <span className="eyebrow">Dapur TBS · pilih cara favoritmu</span>
          <h2>Inspirasi Sajian</h2>
          <p>Ide sederhana untuk menikmati produk favorit di rumah.</p>
        </div>
        {d.recipes?.length ? (
          <div className="recipe-grid">
            {d.recipes.map((r: any, i: number) => <RecipeCard key={r.recipe_id} r={r} i={i} store={store} thisProduct={p} />)}
          </div>
        ) : <p style={{ color: "var(--muted)" }}>Inspirasi sajian untuk produk ini menyusul.</p>}
      </section>

      <section className="detail-section" id="detail">
        <div className="section-heading"><span className="eyebrow">Lebih dekat</span><h2>{p.detail_heading || "Setiap detail bercerita."}</h2></div>
        <div className="image-slot detail-image" data-slot="2">
          {detail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={detail.url} alt={detail.alt || p.name} loading="lazy" />
          ) : <div className="missing"><span className="number">03</span><strong>Detail produk</strong><small>DETAIL · 3:2</small></div>}
        </div>
        <section id="informasi">
          <div className="details-title"><h2>Informasi produk</h2><span>PRODUCT NOTES</span></div>
          <dl className="specs">
            <div className="fact"><dt>Nama produk</dt><dd>{p.name}</dd></div>
            {p.sku ? <div className="fact pos-item-fact"><dt>Item Number</dt><dd>{p.sku}</dd></div> : null}
            {p.barcodes?.length ? <div className="fact"><dt>Barcode pilihan</dt><dd>{p.barcodes.join(", ")}</dd></div> : null}
            <div className="fact"><dt>Asal produk</dt><dd>{p.origin || "Belum diisi"}</dd></div>
            <div className="fact"><dt>Berat / isi</dt><dd>{p.weight_contents || "Belum diisi"}</dd></div>
            <div className="fact"><dt>Penyimpanan</dt><dd>{p.storage || "Belum diisi"}</dd></div>
            {p.notice ? <div className="fact"><dt>Catatan</dt><dd>{p.notice}</dd></div> : null}
            {benefits.length ? <div className="fact"><dt>Manfaat</dt><dd>{benefits.map((b) => b.title).join(" · ")}</dd></div> : null}
            {nutrition.length ? <div className="fact"><dt>Kandungan</dt><dd>{nutrition.map((b) => b.title).join(" · ")}</dd></div> : null}
          </dl>
          {p.price_note ? <div className="price-note">{p.price_note}</div> : null}
          {benefits.some((b) => b.source_name) ? (
            <p style={{ fontSize: 11.5, color: "var(--muted)" }}>Sumber dan catatan gizi: {[...new Set(benefits.concat(nutrition).map((b) => b.source_name).filter(Boolean))].join(", ")}</p>
          ) : null}
        </section>
      </section>

      {groups.length ? (
        <section className="general-content" id="layanan">
          {groups.map((g) => g.policy ? (
            <details key={g.title} className="service-policy">
              <summary>{g.title}</summary>
              <div className="policy-content">
                {g.items.map((b, i) => <article key={b.block_key} className="service-block"><span className="service-number" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span><h3>{b.heading}</h3><p>{b.body}</p></article>)}
              </div>
            </details>
          ) : (
            <section key={g.title} className="service-section">
              <div className="details-title"><h2>{g.title}</h2></div>
              <div className="service-grid">
                {g.items.map((b, i) => <article key={b.block_key} className="service-block"><span className="service-number" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span><h3>{b.heading}</h3><p>{b.body}</p></article>)}
              </div>
            </section>
          ))}
        </section>
      ) : null}

      {d.related?.length ? (
        <section className="recipe-section" style={{ marginTop: 40 }}>
          <div className="section-heading"><span className="eyebrow">Masih dari {p.category_name || "koleksi TBS"}</span><h2>Produk serupa</h2></div>
          <div className="catalog-grid">
            {d.related.slice(0, 6).map((r: CardItem) => (
              <Link key={r.id} href={`/tbs/p/${encodeURIComponent(r.id)}`} className="product-card">
                <div className="card-picture">{r.image_small ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.image_small} alt={r.name} loading="lazy" /> : <div className="photo-pending"><strong>Foto produk<br />segera hadir</strong></div>}</div>
                <div className="card-copy"><span className="card-category">{r.category_name}</span><h3>{r.name}</h3><strong className="card-price">{r.price ? rp(r.price) : "—"}</strong><span className="card-action">Lihat produk <span aria-hidden="true">↗</span></span></div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function groupBlocks(blocks: { block_key: string; section: string; heading: string; body: string }[]) {
  const order: string[] = [];
  const map = new Map<string, typeof blocks>();
  for (const b of blocks) {
    if (!b.heading && !b.body) continue;
    const title = String(b.section || "").replace(/^[A-Z]\.\s*/, "").trim() || "Layanan TBS";
    if (!map.has(title)) { map.set(title, []); order.push(title); }
    map.get(title)!.push(b);
  }
  return order.map((title) => ({ title, items: map.get(title)!, policy: /information|refund|cancellation|shipping|kebijakan|ketentuan/i.test(title) }));
}

function RecipeCard({ r, i, store, thisProduct }: { r: any; i: number; store: string; thisProduct: any }) {
  const [added, setAdded] = useState("");
  const shop: any[] = Array.isArray(r.shopping) ? r.shopping : [];
  const buyable = shop.filter((s) => s.product && s.product.sku);
  const addAll = () => {
    if (!store) { window.dispatchEvent(new Event("tbs-open-picker")); return; }
    const items = loadBasket(store);
    let n = 0;
    for (const s of buyable) {
      const packs = Math.max(1, Number(s.packs) || 1);
      const price = Number(s.product.price) || 0;
      if (!(price > 0)) continue;
      const cur = items[s.product.sku]?.qty || 0;
      items[s.product.sku] = { sku: s.product.sku, name: s.product.name, price, unit: "pcs", qty: Math.min(99, cur + packs) } as BasketLine;
      n++;
    }
    saveBasket(store, items);
    setAdded(n ? `${n} bahan ditambahkan — harga dikonfirmasi toko.` : "Bahan belum tersedia untuk dipesan.");
    setTimeout(() => setAdded(""), 2500);
  };
  return (
    <article className="recipe-card">
      <figure className="recipe-dish">
        {r.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.image_url} alt={r.image_alt || r.title} width={1536} height={1024} loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : null}
        <span className="recipe-photo-number">{String(i + 1).padStart(2, "0")}</span>
        <figcaption>Ilustrasi sajian · AI</figcaption>
      </figure>
      <div className="recipe-card-body">
        <p className="recipe-meta">Adaptasi TBS{r.serving_note ? ` · ${r.serving_note}` : ""}</p>
        <h3><span className="recipe-title-highlight">{r.title}</span></h3>
        {shop.length ? (
          <>
            <div className="recipe-ingredients-heading"><h4>Belanja bahan</h4><span>{shop.length} bahan</span></div>
            <p className="recipe-link-hint">Ketuk bahan untuk melihat produknya.</p>
            <ul className="recipe-ingredients">
              {shop.map((s, k) => (
                <li key={k}>
                  {s.product ? (
                    <Link className="recipe-ingredient" href={`/tbs/p/${encodeURIComponent(s.product.id)}`}>
                      <span className="ingredient-copy"><strong>{s.label}</strong><small className="ingredient-barcode">{s.product.sku ? `Barcode ${s.product.sku}` : "Produk TBS"}</small></span>
                      <span className="ingredient-quantity">{s.quantity}</span><span aria-hidden="true">↗</span>
                    </Link>
                  ) : (
                    <span className="recipe-ingredient" style={{ cursor: "default" }}>
                      <span className="ingredient-copy"><strong>{s.label}</strong><small className="ingredient-barcode">Belum tersedia di katalog</small></span>
                      <span className="ingredient-quantity">{s.quantity}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {buyable.length ? (
              <button className="recipe-add-all" type="button" onClick={addAll} aria-label={`Tambah semua bahan untuk ${r.title}`}>
                <Icon id="cart" /><span>Tambah semua bahan</span><span className="recipe-add-count">{buyable.length}</span>
              </button>
            ) : null}
            {added ? <p className="recipe-cart-caption">{added}</p> : null}
          </>
        ) : r.ingredients?.length ? (
          <ul className="recipe-ingredients">{r.ingredients.map((x: string, k: number) => <li key={k}><span className="recipe-ingredient"><span className="ingredient-copy"><strong>{x}</strong></span></span></li>)}</ul>
        ) : null}
        {r.steps?.length ? (
          <details className="recipe-method" open={i === 0}>
            <summary>Cara membuat</summary>
            <ol>{r.steps.map((s: string, k: number) => <li key={k}>{s}</li>)}</ol>
          </details>
        ) : null}
        {r.tbs_note ? <p className="recipe-note">{r.tbs_note}</p> : null}
        {r.source_name ? (
          <div className="recipe-source">Inspirasi resep<br />
            {r.source_url ? <a className="content-source" href={r.source_url} target="_blank" rel="noopener noreferrer">{r.source_name} <span aria-hidden="true">↗</span></a> : r.source_name}
          </div>
        ) : null}
      </div>
    </article>
  );
}
