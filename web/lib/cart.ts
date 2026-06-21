// web/lib/cart.ts
import { BOX_PRICES, FLAVORS as CATALOG_FLAVORS } from "@/lib/catalog";
import type { RepackCombo } from "@/lib/bundleDeals";

export type CartItem = {
  id: string; // flavor / smoothie id
  name: string;
  price: number; // per-unit price
  quantity: number;
  image?: string;
  kind?: "cookie" | "drink"; // drinks price differently and earn drink stamps
};

export type CartBox = {
  boxSize: number; // 1 | 3 | 6 (for bundles: total item count)
  items: CartItem[];
  total: number; // box total (authoritative)
  kind?: "box" | "bundle"; // default "box"
  label?: string; // e.g. bundle name; shown instead of "Box of N"
  reward?: { tierId: string; threshold: number }; // a spend-threshold reward (re-validated server-side)
};

export type CartState = {
  boxes: CartBox[];
};

export const CART_KEY = "cookie_doh_cart_v1";

// Legacy keys seen before
const LEGACY_KEYS = ["cookieDohCart", "cookie_doh_cart", "cookie_doh_cart_v0", "cart", "cart_items"];

const DEFAULT_COOKIE_PRICE = 32500;

function safeJSONParse<T = any>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isCartState(x: any): x is CartState {
  return !!x && Array.isArray(x.boxes);
}

function normalizeBox(box: any): CartBox | null {
  if (!box) return null;
  const boxSize = Number(box.boxSize);
  const items = Array.isArray(box.items) ? box.items : [];
  const total = Number(box.total);

  if (!boxSize || items.length === 0) return null;

  const normItems: CartItem[] = items
    .map((it: any) => {
      const id = String(it.id ?? it.flavorId ?? "");
      if (!id) return null;

      const quantity = Number(it.quantity ?? it.qty ?? 0);
      if (!quantity || quantity <= 0) return null;

      const cat = (CATALOG_FLAVORS as any[]).find((f) => String(f.id) === id);

      const name = String(it.name ?? cat?.name ?? id);
      const image = String(it.image ?? cat?.image ?? "");
      const priceRaw = Number(it.price ?? DEFAULT_COOKIE_PRICE);
      const price = Number.isFinite(priceRaw) && priceRaw > 0 ? priceRaw : DEFAULT_COOKIE_PRICE;
      const kind = it.kind === "drink" || it.kind === "cookie" ? it.kind : undefined;

      return { id, name, image, quantity, price, ...(kind ? { kind } : {}) };
    })
    .filter(Boolean) as CartItem[];

  if (normItems.length === 0) return null;

  const computed = normItems.reduce((sum, it) => sum + it.price * it.quantity, 0);

  return {
    boxSize,
    items: normItems,
    total: Number.isFinite(total) && total > 0 ? total : computed,
    ...(box.kind === "bundle" ? { kind: "bundle" as const } : {}),
    ...(box.label ? { label: String(box.label) } : {}),
    ...(box.reward?.tierId
      ? { reward: { tierId: String(box.reward.tierId), threshold: Math.max(0, Math.floor(Number(box.reward.threshold || 0))) } }
      : {}),
  };
}

function migrateLegacyIfNeeded(): CartState | null {
  if (typeof window === "undefined") return null;

  const existing = safeJSONParse<any>(localStorage.getItem(CART_KEY));
  if (isCartState(existing)) return null;

  for (const k of LEGACY_KEYS) {
    const legacy = safeJSONParse<any>(localStorage.getItem(k));
    if (!legacy) continue;

    // Legacy homepage preset format: array of { boxSize, items:[{flavorId,qty}], price }
    if (Array.isArray(legacy)) {
      const boxes: CartBox[] = legacy
        .map((entry: any) => {
          const boxSize = Number(entry.boxSize);
          const itemsArr = Array.isArray(entry.items) ? entry.items : [];
          if (!boxSize || itemsArr.length === 0) return null;

          const items: CartItem[] = itemsArr
            .map((x: any) => {
              const id = String(x.flavorId ?? x.id ?? "");
              const quantity = Number(x.qty ?? x.quantity ?? 0);
              if (!id || quantity <= 0) return null;

              const cat = (CATALOG_FLAVORS as any[]).find((f) => String(f.id) === id);
              return {
                id,
                name: String(cat?.name ?? id),
                image: String(cat?.image ?? ""),
                quantity,
                price: DEFAULT_COOKIE_PRICE,
              };
            })
            .filter(Boolean) as CartItem[];

          if (items.length === 0) return null;

          const total =
            Number(entry.price) ||
            (BOX_PRICES as any)[boxSize] ||
            items.reduce((sum, it) => sum + it.price * it.quantity, 0);

          return { boxSize, items, total };
        })
        .filter(Boolean) as CartBox[];

      if (boxes.length > 0) {
        const next: CartState = { boxes };
        localStorage.setItem(CART_KEY, JSON.stringify(next));
        return next;
      }
    }

    // Legacy object state with boxes
    if (isCartState(legacy)) {
      const boxes = (legacy.boxes as any[])
        .map(normalizeBox)
        .filter(Boolean) as CartBox[];

      const next: CartState = { boxes };
      localStorage.setItem(CART_KEY, JSON.stringify(next));
      return next;
    }
  }

  return null;
}

function readCart(): CartState {
  if (typeof window === "undefined") return { boxes: [] };

  const migrated = migrateLegacyIfNeeded();
  if (migrated) return migrated;

  const parsed = safeJSONParse<any>(localStorage.getItem(CART_KEY));
  if (!parsed || !isCartState(parsed)) return { boxes: [] };

  const boxes = (parsed.boxes as any[])
    .map(normalizeBox)
    .filter(Boolean) as CartBox[];

  return { boxes };
}

function writeCart(state: CartState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CART_KEY, JSON.stringify(state));
}

// Public API
export function getCart(): CartState {
  return readCart();
}

export function setCart(next: CartState) {
  const boxes = (next?.boxes ?? []).map(normalizeBox).filter(Boolean) as CartBox[];
  writeCart({ boxes });
}

export function addBoxToCart(box: CartBox) {
  const cart = readCart();
  const norm = normalizeBox(box);
  if (!norm) return;

  cart.boxes.unshift(norm);
  writeCart(cart);
}

export function addBundleToCart(params: {
  label: string;
  items: CartItem[];
  total: number;
}) {
  const cart = readCart();
  const norm = normalizeBox({
    boxSize: params.items.reduce((n, it) => n + (it.quantity || 0), 0),
    items: params.items,
    total: params.total,
    kind: "bundle",
    label: params.label,
  });
  if (!norm) return;
  cart.boxes.unshift(norm);
  writeCart(cart);
}

// Add a single add-on cookie (cart upsell). Earns loyalty like any single cookie
// (NOT a bundle). Merges into an existing same-flavour single so repeated taps
// just bump the quantity instead of stacking entries.
export function addUpsellSingle(item: { id: string; name: string; price?: number; image?: string; kind?: "cookie" | "drink" }) {
  const id = String(item.id);
  if (!id) return;
  const price = Number.isFinite(Number(item.price)) && Number(item.price) > 0 ? Number(item.price) : DEFAULT_COOKIE_PRICE;
  const kind = item.kind === "drink" ? "drink" : undefined;
  const cart = readCart();
  // Only merge into a previously-added add-on single — identified by a label on a
  // non-bundle box AND the single price (32500). A real box (even all-same-flavour)
  // has no label and uses the cheaper in-box price, so it's never touched.
  const existing = cart.boxes.find(
    (b) =>
      b.kind !== "bundle" &&
      !!b.label &&
      b.items.length === 1 &&
      String(b.items[0].id) === id &&
      Number(b.items[0].price) === price
  );
  if (existing) {
    existing.items[0].quantity += 1;
    existing.boxSize = existing.items[0].quantity;
    existing.total = existing.items[0].price * existing.items[0].quantity;
  } else {
    cart.boxes.unshift({
      boxSize: 1,
      items: [{ id, name: item.name, price, quantity: 1, ...(item.image ? { image: item.image } : {}), ...(kind ? { kind } : {}) }],
      total: price,
      label: item.name,
    });
  }
  writeCart(cart);
}

// Add (or replace) the spend-threshold reward. Only one reward at a time. It's a
// "bundle" (so it doesn't earn loyalty — it's promotional) at the special price,
// re-validated server-side at checkout.
export function addSpendReward(tier: {
  id: string;
  threshold_idr: number;
  label: string;
  special_price_idr: number;
  items: { id: string; name: string; quantity: number }[];
}) {
  const items: CartItem[] = (tier.items || [])
    .map((it) => ({ id: String(it.id), name: String(it.name), price: 0, quantity: Math.max(1, Math.floor(Number(it.quantity || 1))) }))
    .filter((it) => it.id);
  if (!items.length) return;
  const boxes = readCart().boxes.filter((b) => !b.reward); // one reward only
  boxes.unshift({
    boxSize: items.reduce((n, it) => n + it.quantity, 0),
    items,
    total: Math.max(0, Math.floor(Number(tier.special_price_idr || 0))),
    kind: "bundle",
    label: tier.label,
    reward: { tierId: String(tier.id), threshold: Math.max(0, Math.floor(Number(tier.threshold_idr || 0))) },
  });
  writeCart({ boxes });
}

// Current quantity of a loose single (cookie/drink add-on) in the cart.
export function looseSingleQty(state: CartState, id: string, price: number): number {
  const b = state.boxes.find(
    (x) => x.kind !== "bundle" && !!x.label && x.items.length === 1 && String(x.items[0].id) === String(id) && Number(x.items[0].price) === price
  );
  return b ? Number(b.items[0].quantity) || 0 : 0;
}

// Remove one of a loose single (the inverse of addUpsellSingle).
export function decUpsellSingle(item: { id: string; price?: number }) {
  const id = String(item.id);
  const price = Number.isFinite(Number(item.price)) && Number(item.price) > 0 ? Number(item.price) : DEFAULT_COOKIE_PRICE;
  const cart = readCart();
  const idx = cart.boxes.findIndex(
    (b) => b.kind !== "bundle" && !!b.label && b.items.length === 1 && String(b.items[0].id) === id && Number(b.items[0].price) === price
  );
  if (idx < 0) return;
  const box = cart.boxes[idx];
  const q = (Number(box.items[0].quantity) || 0) - 1;
  if (q <= 0) cart.boxes.splice(idx, 1);
  else {
    box.items[0].quantity = q;
    box.boxSize = q;
    box.total = box.items[0].price * q;
  }
  writeCart(cart);
}

export function removeReward() {
  const cart = readCart();
  if (!cart.boxes.some((b) => b.reward)) return;
  writeCart({ boxes: cart.boxes.filter((b) => !b.reward) });
}

// Merchandise subtotal that counts toward a reward threshold — excludes the reward itself.
export function qualifyingSubtotal(state: CartState): number {
  return state.boxes.filter((b) => !b.reward).reduce((s, b) => s + (Number(b.total) || 0), 0);
}

// A "loose cookie" = a single-cookie add-on (labelled, not a bundle, not a reward,
// no drinks). These are what the "complete the box" upsell packs into a box.
function isLooseCookieBox(b: CartBox): boolean {
  return b.kind !== "bundle" && !b.reward && !!b.label && b.items.length > 0 && b.items.every((it) => it.kind !== "drink");
}
export function looseCookieCount(state: CartState): number {
  return state.boxes
    .filter(isLooseCookieBox)
    .reduce((n, b) => n + b.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0), 0);
}

// Pack the loose cookies into a Box of 3/6, topping up with `fill` cookies as
// needed (the box is cheaper per cookie — the upsell "deal"). Replaces the loose
// singles with one box priced at BOX_PRICES.
export function completeToBox(targetSize: 3 | 6, fill: { id: string; name: string; image?: string }) {
  const cart = readCart();
  const loose = cart.boxes.filter(isLooseCookieBox);
  if (!loose.length) return;

  const items: CartItem[] = [];
  let count = 0;
  for (const b of loose)
    for (const it of b.items) {
      items.push({ id: it.id, name: it.name, price: DEFAULT_COOKIE_PRICE, quantity: it.quantity, ...(it.image ? { image: it.image } : {}) });
      count += Number(it.quantity) || 0;
    }
  if (count > targetSize) return; // only used when loose cookies fit in the box

  const need = targetSize - count;
  if (need > 0) {
    if (!fill?.id) return;
    items.push({ id: String(fill.id), name: String(fill.name), price: DEFAULT_COOKIE_PRICE, quantity: need, ...(fill.image ? { image: fill.image } : {}) });
  }

  const rest = cart.boxes.filter((b) => !isLooseCookieBox(b));
  rest.unshift({ boxSize: targetSize, items, total: BOX_PRICES[targetSize] });
  writeCart({ boxes: rest });
}

// ---- Bundle completion upsell ----------------------------------------------
// "Convertible" boxes = real boxes + loose singles (NOT existing bundles/rewards)
// that can be folded into a bundle.
function isConvertibleBox(b: CartBox): boolean {
  return b.kind !== "bundle" && !b.reward;
}

// Count cookies vs drinks across the convertible boxes (a box of 6 = 6 cookies).
export function cartItemCounts(state: CartState): { cookies: number; drinks: number } {
  let cookies = 0;
  let drinks = 0;
  for (const b of state.boxes) {
    if (!isConvertibleBox(b)) continue;
    for (const it of b.items) {
      const q = Number(it.quantity) || 0;
      if (it.kind === "drink") drinks += q;
      else cookies += q;
    }
  }
  return { cookies, drinks };
}

// Fold the cart's loose cookies + drinks into a named bundle, topping up the
// shortfall with `fill` items. The bundle is server-priced by name. Leaves any
// existing bundles/rewards untouched.
export function completeToBundle(
  bundle: { id: string; name: string; cookies: number; drinks: number; price: number },
  fill: { cookie?: { id: string; name: string; image?: string }; drink?: { id: string; name: string; image?: string } }
) {
  const cart = readCart();
  const convertible = cart.boxes.filter(isConvertibleBox);
  if (!convertible.length) return;

  const cookieItems: CartItem[] = [];
  const drinkItems: CartItem[] = [];
  for (const b of convertible)
    for (const it of b.items) {
      const base = { id: it.id, name: it.name, quantity: Number(it.quantity) || 0, ...(it.image ? { image: it.image } : {}) };
      if (it.kind === "drink") drinkItems.push({ ...base, price: 39000, kind: "drink" });
      else cookieItems.push({ ...base, price: DEFAULT_COOKIE_PRICE });
    }

  const cCount = cookieItems.reduce((n, it) => n + it.quantity, 0);
  const dCount = drinkItems.reduce((n, it) => n + it.quantity, 0);
  if (cCount > bundle.cookies || dCount > bundle.drinks) return; // must fit inside the bundle

  const needC = bundle.cookies - cCount;
  const needD = bundle.drinks - dCount;
  if (needC > 0) {
    if (!fill.cookie?.id) return;
    cookieItems.push({ id: String(fill.cookie.id), name: String(fill.cookie.name), price: DEFAULT_COOKIE_PRICE, quantity: needC, ...(fill.cookie.image ? { image: fill.cookie.image } : {}) });
  }
  if (needD > 0) {
    if (!fill.drink?.id) return;
    drinkItems.push({ id: String(fill.drink.id), name: String(fill.drink.name), price: 39000, quantity: needD, kind: "drink", ...(fill.drink.image ? { image: fill.drink.image } : {}) });
  }

  // Merge same id+kind so the bundle shows clean lines.
  const merged: CartItem[] = [];
  for (const it of [...cookieItems, ...drinkItems]) {
    const hit = merged.find((m) => m.id === it.id && m.kind === it.kind);
    if (hit) hit.quantity += it.quantity;
    else merged.push({ ...it });
  }

  const rest = cart.boxes.filter((b) => !isConvertibleBox(b));
  rest.unshift({ boxSize: bundle.cookies + bundle.drinks, items: merged, total: bundle.price, kind: "bundle", label: bundle.name });
  writeCart({ boxes: rest });
}

// A loose single = a labelled, non-bundle, non-reward box with one item (cookie OR drink).
function isLooseSingleBox(b: CartBox): boolean {
  return b.kind !== "bundle" && !b.reward && !!b.label && b.items.length === 1;
}

// Loose cookies + drinks only (for the "best deal" repackaging — boxes are left alone).
export function looseSingleCounts(state: CartState): { cookies: number; drinks: number } {
  let cookies = 0;
  let drinks = 0;
  for (const b of state.boxes) {
    if (!isLooseSingleBox(b)) continue;
    const it = b.items[0];
    const q = Number(it.quantity) || 0;
    if (it.kind === "drink") drinks += q;
    else cookies += q;
  }
  return { cookies, drinks };
}

// Opt-in "best deal": repackage the loose cookies + drinks into the given bundle
// combo, leaving the rest as loose singles. Builds each bundle from the actual loose
// items and decrements exactly what was consumed.
export function applyBestDeal(combo: RepackCombo) {
  const cart = readCart();
  const cookieQ: { id: string; name: string; image?: string }[] = [];
  const drinkQ: { id: string; name: string; image?: string }[] = [];
  for (const b of cart.boxes) {
    if (!isLooseSingleBox(b)) continue;
    const it = b.items[0];
    for (let i = 0; i < (Number(it.quantity) || 0); i++) {
      const e = { id: it.id, name: it.name, ...(it.image ? { image: it.image } : {}) };
      if (it.kind === "drink") drinkQ.push(e);
      else cookieQ.push(e);
    }
  }
  let ci = 0;
  let di = 0;
  const consumed: Record<string, number> = {};
  const newBundleBoxes: CartBox[] = [];
  for (const x of combo) {
    for (let n = 0; n < x.count; n++) {
      const cm: Record<string, CartItem> = {};
      const dm: Record<string, CartItem> = {};
      for (let k = 0; k < x.cookies; k++) {
        const it = cookieQ[ci++];
        if (!it) return;
        if (cm[it.id]) cm[it.id].quantity += 1;
        else cm[it.id] = { id: it.id, name: it.name, price: DEFAULT_COOKIE_PRICE, quantity: 1, ...(it.image ? { image: it.image } : {}) };
        consumed[`cookie:${it.id}`] = (consumed[`cookie:${it.id}`] || 0) + 1;
      }
      for (let k = 0; k < x.drinks; k++) {
        const it = drinkQ[di++];
        if (!it) return;
        if (dm[it.id]) dm[it.id].quantity += 1;
        else dm[it.id] = { id: it.id, name: it.name, price: 39000, quantity: 1, kind: "drink", ...(it.image ? { image: it.image } : {}) };
        consumed[`drink:${it.id}`] = (consumed[`drink:${it.id}`] || 0) + 1;
      }
      newBundleBoxes.push({ boxSize: x.cookies + x.drinks, items: [...Object.values(cm), ...Object.values(dm)], total: x.price, kind: "bundle", label: x.name });
    }
  }
  // Decrement the loose boxes by what we consumed; keep leftovers, drop emptied ones.
  const rest: CartBox[] = [];
  for (const b of cart.boxes) {
    if (!isLooseSingleBox(b)) { rest.push(b); continue; }
    const it = b.items[0];
    const key = `${it.kind === "drink" ? "drink" : "cookie"}:${it.id}`;
    const dec = consumed[key] || 0;
    if (!dec) { rest.push(b); continue; }
    const q = (Number(it.quantity) || 0) - dec;
    if (q > 0) rest.push({ ...b, boxSize: q, total: it.price * q, items: [{ ...it, quantity: q }] });
  }
  writeCart({ boxes: [...newBundleBoxes, ...rest] });
}

export function removeBoxAt(index: number) {
  const cart = readCart();
  const next = { boxes: cart.boxes.slice() };
  if (index < 0 || index >= next.boxes.length) return;
  next.boxes.splice(index, 1);
  writeCart(next);
}

export function clearCart() {
  writeCart({ boxes: [] });
}

export function removeSoldOutItemsFromCart(): CartState {
  const soldOut = new Set<string>();
  for (const f of CATALOG_FLAVORS as any[]) {
    if (f?.soldOut) soldOut.add(String(f.id));
  }

  const cart = readCart();
  const next: CartState = {
    boxes: cart.boxes
      .map((b) => ({
        ...b,
        items: b.items.filter((it) => !soldOut.has(String(it.id))),
      }))
      .filter((b) => b.items.length > 0),
  };

  // Recompute safe totals if needed
  next.boxes = next.boxes.map((b) => {
    const computed = b.items.reduce((sum, it) => sum + it.price * it.quantity, 0);
    return { ...b, total: Number.isFinite(b.total) && b.total > 0 ? b.total : computed };
  });

  writeCart(next);
  return next;
}
