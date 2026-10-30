// web/lib/tbsContent.ts — server-side reads of the TotalBuahStore CONTENT layer
// (tables in web/sql/tbs_content.sql, loaded from the owner's product-master
// sheet by scripts/tbs-content-load.py) and the LIVE overlay from the ERP.
//
// Split of truth:
//   • copy, photos, categories, recipes, facts  → CD Supabase (this file)
//   • price, stock, box variants, availability  → ERP partner API (lib/tbsShop)
// A product the ERP does not list (its web catalogue is a curated top-80%
// subset) still renders — with the sheet price as a fallback and no add-to-
// basket, so the shop never charges a price the ERP would not honour.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { partnerGet, partnerGetStock } from "@/lib/tbsShop";
import { bundlePrice, BUNDLE_SIZES } from "@/lib/tbsBundle";

let client: SupabaseClient | null = null;
export function supa(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export type ContentImage = { role: "hero_portrait" | "landscape_banner" | "detail" | "size_reference"; src_id: string; url: string; url_small: string; w: number | null; h: number | null; alt: string };
export type CardItem = {
  id: string; sku: string | null; name: string; slug: string | null;
  category_code: string | null; category_name: string | null; subcategory_code: string | null;
  image: string | null; image_small: string | null;
  price: number | null; price_source: "live" | "sheet" | "none";
  unit: string; primary_unit: string | null; has_bundles: boolean;
  stock: number; status: "in_stock" | "out_of_stock" | "unknown" | "not_sold";
  /** set on the member that stands for a product FAMILY (several flavours, own barcode + price each) */
  family: { id: string; name: string; count: number; flavours: string[] } | null;
  flavour: string | null;
};

const CARD_COLS = "product_id,sku,name,slug,category_code,category_label,subcategory_code,images,sheet_price,primary_unit,has_bundles,family_id,family_name,flavour,family_primary";
/** catalogue rows: stand-alone products + ONE card per family */
const CARD_FILTER = "family_id.is.null,family_primary.eq.true";

let BUNDLE_LIVE_CACHE: { at: number; v: boolean } | null = null;
export async function bundleDiscountLive(): Promise<boolean> {
  if (BUNDLE_LIVE_CACHE && Date.now() - BUNDLE_LIVE_CACHE.at < 10_000) return BUNDLE_LIVE_CACHE.v;
  let v = false;
  try {
    const { data } = await supa().from("app_settings").select("value").eq("key", "tbs_bundle_discount").maybeSingle();
    v = data?.value === "true";
  } catch { /* default off */ }
  BUNDLE_LIVE_CACHE = { at: Date.now(), v };
  return v;
}

let CAT_CACHE: { at: number; v: any[] } | null = null;
export async function categories(): Promise<{ code: string; name: string; icon: string; icon_id: string; display_order: number; subcategories: { code: string; name: string; order: number }[] }[]> {
  if (CAT_CACHE && Date.now() - CAT_CACHE.at < 60_000) return CAT_CACHE.v;
  const { data } = await supa().from("tbs_content_category").select("code,name,icon,icon_id,display_order,subcategories").order("display_order");
  CAT_CACHE = { at: Date.now(), v: data || [] };
  return CAT_CACHE.v;
}

function hero(images: any): { l: string | null; s: string | null } {
  const list: ContentImage[] = Array.isArray(images) ? images : [];
  const h = list.find((i) => i.role === "hero_portrait") || list[0];
  return { l: h?.url || null, s: h?.url_small || h?.url || null };
}

/** Overlay live ERP price/stock onto content rows that have a SKU. Silent on ERP failure. */
export async function overlayLive(store: string, rows: any[], catNames: Map<string, string>): Promise<CardItem[]> {
  const skus = rows.map((r) => r.sku).filter(Boolean) as string[];
  // family cards: count + flavour list of the whole family (one query for the page)
  const famIds = [...new Set(rows.filter((r) => r.family_id && r.family_primary).map((r) => String(r.family_id)))];
  const fam = new Map<string, { count: number; flavours: string[] }>();
  if (famIds.length) {
    const { data: mem } = await supa().from("tbs_content_product").select("family_id,flavour,sheet_price,name").in("family_id", famIds).eq("listed", true).order("sheet_price", { ascending: true, nullsFirst: false });
    for (const m of mem || []) {
      const f = fam.get(m.family_id) || { count: 0, flavours: [] };
      f.count += 1; if (m.flavour) f.flavours.push(m.flavour);
      fam.set(m.family_id, f);
    }
  }
  let live = new Map<string, any>();
  let stockLive = false;
  if (store && skus.length) {
    const got = await partnerGetStock(store, skus.slice(0, 180)).catch(() => null);
    if (Array.isArray(got)) {
      for (const x of got) live.set(String(x.sku), x);
      stockLive = got.some((x: any) => x.stockLive);
    }
  }
  return rows.map((r) => {
    const im = hero(r.images);
    const x = r.sku ? live.get(r.sku) : null;
    const liveOk = x && Number(x.price) > 0;
    const stock = liveOk ? Math.max(0, Number(x.stock) || 0) : 0;
    const f = r.family_id && r.family_primary ? fam.get(String(r.family_id)) : null;
    return {
      id: r.product_id, sku: r.sku || null, name: f ? (r.family_name || r.name) : r.name, slug: r.slug || null,
      category_code: r.category_code || null, category_name: (r.category_code && catNames.get(r.category_code)) || r.category_label || null,
      subcategory_code: r.subcategory_code || null,
      image: im.l, image_small: im.s,
      price: liveOk ? Math.round(Number(x.price)) : r.sheet_price ? Number(r.sheet_price) : null,
      price_source: liveOk ? "live" : r.sheet_price ? "sheet" : "none",
      unit: liveOk ? String(x.unit || "pcs") : "pcs",
      primary_unit: r.primary_unit || null, has_bundles: Boolean(r.has_bundles),
      stock,
      status: !liveOk ? "not_sold" : !stockLive ? "unknown" : stock > 0 ? "in_stock" : "out_of_stock",
      family: f ? { id: String(r.family_id), name: r.family_name || r.name, count: f.count, flavours: f.flavours } : null,
      flavour: r.flavour || null,
    };
  });
}

export async function catalogPage(opts: { store: string; category?: string; sub?: string; q?: string; sort?: string; offset: number; limit: number }) {
  const cats = await categories();
  const catNames = new Map(cats.map((c) => [c.code, c.name]));
  let qb = supa().from("tbs_content_product").select(CARD_COLS, { count: "exact" }).eq("listed", true).or(CARD_FILTER);
  if (opts.category) qb = qb.eq("category_code", opts.category);
  if (opts.sub) qb = qb.eq("subcategory_code", opts.sub);
  if (opts.q) {
    const q = opts.q.replace(/[%,()]/g, " ").trim();
    if (q) qb = qb.or(`name.ilike.%${q}%,family_name.ilike.%${q}%,sku.ilike.${q}%`);
  }
  if (opts.sort === "price_asc") qb = qb.order("sheet_price", { ascending: true, nullsFirst: false }).order("name");
  else if (opts.sort === "price_desc") qb = qb.order("sheet_price", { ascending: false, nullsFirst: false }).order("name");
  else qb = qb.order("name");
  const { data, count, error } = await qb.range(opts.offset, opts.offset + opts.limit - 1);
  if (error) throw new Error(error.message);
  const items = await overlayLive(opts.store, data || [], catNames);
  return { items, total: count || 0 };
}

let COUNT_CACHE: { at: number; v: Record<string, number> } | null = null;
export async function categoryCounts(): Promise<Record<string, number>> {
  if (COUNT_CACHE && Date.now() - COUNT_CACHE.at < 60_000) return COUNT_CACHE.v;
  const { data } = await supa().from("tbs_content_product").select("category_code").eq("listed", true).or(CARD_FILTER).limit(5000);
  const v: Record<string, number> = {};
  for (const r of data || []) if (r.category_code) v[r.category_code] = (v[r.category_code] || 0) + 1;
  COUNT_CACHE = { at: Date.now(), v };
  return v;
}

export async function productDetail(idOrSku: string, store: string) {
  const s = supa();
  let { data: p } = await s.from("tbs_content_product").select("*").eq("product_id", idOrSku).maybeSingle();
  // the preview site's family card id ("family-<id>") → the member that stands for the family
  if (!p && idOrSku.startsWith("family-")) ({ data: p } = await s.from("tbs_content_product").select("*").eq("family_id", idOrSku.slice(7)).eq("listed", true).order("family_primary", { ascending: false }).limit(1).maybeSingle());
  if (!p) ({ data: p } = await s.from("tbs_content_product").select("*").eq("sku", idOrSku).eq("listed", true).order("updated_at", { ascending: false }).limit(1).maybeSingle());
  if (!p) ({ data: p } = await s.from("tbs_content_product").select("*").eq("slug", idOrSku).eq("listed", true).limit(1).maybeSingle());
  if (!p) return null;
  const [cats, { data: recipes }, { data: facts }, { data: variants }, { data: blocks }, live, discountLive] = await Promise.all([
    categories(),
    s.from("tbs_content_recipe").select("*").eq("product_id", p.product_id).eq("web_visible", true).order("display_order"),
    s.from("tbs_content_fact").select("*").eq("product_id", p.product_id).order("display_order"),
    s.from("tbs_content_variant").select("*").eq("product_id", p.product_id),
    s.from("tbs_content_block").select("block_key,section,heading,body").order("block_key"),
    p.sku && store ? partnerGet("/product", { store, sku: p.sku }).catch(() => null) : Promise.resolve(null),
    bundleDiscountLive(),
  ]);
  const cat = cats.find((c) => c.code === p.category_code) || null;
  const sub = cat?.subcategories?.find((x: any) => x.code === p.subcategory_code) || null;
  const found = Boolean(live && live.found);
  const unitPrice = found ? Math.round(Number(live.product?.price) || 0) : p.sheet_price ? Number(p.sheet_price) : 0;
  const unit = found ? String(live.product?.unit || "pcs") : (p.primary_unit || "pcs");
  const bundles = p.has_bundles && unitPrice > 0
    ? BUNDLE_SIZES.map((n) => ({ size: n, ...bundlePrice(unitPrice, n, discountLive) }))
    : [];
  const catNames = new Map(cats.map((c) => [c.code, c.name]));
  // family: every flavour of this product, with its own live price for the chosen store
  let family: { id: string; name: string; members: (CardItem & { current: boolean })[] } | null = null;
  if (p.family_id) {
    const { data: mem } = await s.from("tbs_content_product").select(CARD_COLS).eq("family_id", p.family_id).eq("listed", true).order("flavour");
    const cards = await overlayLive(store, (mem || []).map((m) => ({ ...m, family_primary: false })), catNames);
    family = { id: p.family_id, name: p.family_name || p.name, members: cards.map((c) => ({ ...c, current: c.id === p.product_id })) };
  }
  // related: same category (other families count once), with a photo first
  let relQ = s.from("tbs_content_product").select(CARD_COLS).eq("listed", true).or(CARD_FILTER)
    .eq("category_code", p.category_code || "").neq("product_id", p.product_id);
  if (p.family_id) relQ = relQ.or(`family_id.is.null,family_id.neq.${p.family_id}`);
  const { data: rel } = await relQ.order("has_bundles", { ascending: false }).limit(8);
  const related = await overlayLive(store, rel || [], catNames);
  // ingredient links: recipe.shopping[].product_id → slug/sku lookup for the matched ones
  const ingIds = new Set<string>();
  for (const r of recipes || []) for (const it of (r.shopping || [])) if (it?.product_id) ingIds.add(String(it.product_id));
  let ingProducts: Record<string, { id: string; name: string; sku: string | null; image_small: string | null; price: number | null }> = {};
  if (ingIds.size) {
    const { data: ip } = await s.from("tbs_content_product").select("product_id,name,sku,images,sheet_price,listed").in("product_id", [...ingIds].slice(0, 100));
    for (const r of ip || []) if (r.listed) ingProducts[r.product_id] = { id: r.product_id, name: r.name, sku: r.sku, image_small: hero(r.images).s, price: r.sheet_price };
  }
  return {
    product: {
      id: p.product_id, sku: p.sku, name: p.name, slug: p.slug,
      category_code: p.category_code, category_name: cat?.name || p.category_label, subcategory_name: sub?.name || null,
      tagline: p.tagline, price_note: p.price_note, origin: p.origin, weight_contents: p.weight_contents, storage: p.storage, notice: p.notice,
      story_heading: p.story_heading, story_intro: p.story_intro, description: p.description, detail_heading: p.detail_heading,
      checkpoints: p.checkpoints || [], tip: p.tip, note: p.note, content_status: p.content_status, barcodes: p.barcodes || [],
      images: p.images || [], primary_unit: p.primary_unit, has_bundles: Boolean(p.has_bundles),
      family_id: p.family_id || null, family_name: p.family_name || null, flavour: p.flavour || null,
    },
    family,
    pricing: { unit_price: unitPrice, unit, source: found ? "live" : p.sheet_price ? "sheet" : "none", bundles, bundle_discount_live: discountLive },
    live: found ? { product: live.product, availability: live.availability || [], variants: live.variants || [] } : null,
    sellable: found,
    recipes: (recipes || []).map((r) => ({ ...r, shopping: (r.shopping || []).map((it: any) => ({ ...it, product: it?.product_id ? ingProducts[String(it.product_id)] || null : null })) })),
    facts: facts || [],
    sheet_variants: variants || [],
    blocks: blocks || [],
    related,
  };
}
