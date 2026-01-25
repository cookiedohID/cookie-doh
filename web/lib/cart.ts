// web/lib/cart.ts
import { BOX_PRICES, FLAVORS as CATALOG_FLAVORS } from "@/lib/catalog";

export type CartItem = {
  id: string; // flavor id
  name: string;
  price: number; // per-cookie price (for display + migration safety)
  quantity: number;
  image?: string;
};

export type CartBox = {
  boxSize: number; // 1 | 3 | 6 (kept flexible for now)
  items: CartItem[];
  total: number; // box total (authoritative)
};

export type CartState = {
  boxes: CartBox[];
};

// ✅ Single source of truth
export const CART_KEY = "cookie_doh_cart_v1";

// Legacy keys we’ve seen in the project
const LEGACY_KEYS = ["cookieDohCart", "cookie_doh_cart", "cookie_doh_cart_v0"];

// Used only for migration (safe fallback)
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

      const name = String(it.name ?? "");
      const image = it.image ? String(it.image) : undefined;
      const quantity = Number(it.quantity ?? it.qty ?? 0);
      const price = Number(it.price ?? DEFAULT_COOKIE_PRICE);

      if (!quantity || quantity <= 0) return null;

      // Resolve missing name/image from catalog when possible
      const cat = (CATALOG_FLAVORS as any[]).find((f) => String(f.id) === id);
      return {
        id,
        name: name || String(cat?.name ?? id),
        image: image || String(cat?.image ?? ""),
        quantity,
        price: Number.isFinite(price) && price > 0 ? price : DEFAULT_COOKIE_PRICE,
      };
    })
    .filter(Boolean) as CartItem[];

  if (normItems.length === 0) return null;

  // If total is missing/invalid, compute a safe fallback
  const computed =
    normItems.reduce((sum, it) => sum + it.price * it.quantity, 0) || 0;

  return {
    boxSize,
    items: normItems,
    total: Number.isFinite(total) && total > 0 ? total : computed,
  };
}

function migrateLegacyIfNeeded(): CartState | null {
  if (typeof window === "undefined") return null;

  // If new cart already exists, do nothing
  const existing = safeJSONParse<any>(localStorage.getItem(CART_KEY));
  if (isCartState(existing)) return null;

  // 1) Try legacy array format: [{ boxSize, items:[{flavorId,qty}], price, createdAt }]
  for (const k of LEGACY_KEYS) {
    const legacy = safeJSONParse<any>(localStorage.getItem(k));
    if (!legacy) continue;

    // Legacy homepage preset format = array
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

          // entry.price is the box total in that legacy format; otherwise fallback to BOX_PRICES
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
        // leave legacy key untouched (safe), but you can later clean it up
        return next;
      }
    }

    // 2) Try legacy object format but different key name
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

  // migrate if needed
  const migrated = migrateLegacyIfNeeded();
  if (migrated) return migrated;

  const parsed = safeJSONParse<any>(localStorage.getItem(CART_KEY));
  if (!parsed) return { boxes: [] };
  if (!isCartState(parsed)) return { boxes: [] };

  const boxes = (parsed.boxes as any[])
    .map(normalizeBox)
    .filter(Boolean) as CartBox[];

  return { boxes };
}

function writeCart(state: CartState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CART_KEY, JSON.stringify(state));
}

// ---------- Public API (single source of truth) ----------

export function getCart(): CartState {
  return readCart();
}

export function setCart(next: CartState) {
  // normalize before saving
  const boxes = (next?.boxes ?? [])
    .map(normalizeBox)
    .filter(Boolean) as CartBox[];
  writeCart({ boxes });
}

export function addBoxToCart(box: CartBox) {
  const cart = readCart();
  const norm = normalizeBox(box);
  if (!norm) return;

  cart.boxes.unshift(norm);
  writeCart(cart);
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

/**
 * Helper: remove sold-out items based on catalog flags.
 * (Cart page can call this instead of re-implementing.)
 */
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

  // keep existing totals; if a box changed, recompute a safe total fallback
  next.boxes = next.boxes.map((b) => {
    const computed = b.items.reduce((sum, it) => sum + it.price * it.quantity, 0);
    return { ...b, total: Number.isFinite(b.total) && b.total > 0 ? b.total : computed };
  });

  writeCart(next);
  return next;
}
