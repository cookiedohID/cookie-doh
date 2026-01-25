// web/lib/cart.ts
import { BOX_PRICES, FLAVORS as CATALOG_FLAVORS } from "@/lib/catalog";

export type CartItem = {
  id: string; // flavor id
  name: string;
  price: number; // per-cookie price
  quantity: number;
  image?: string;
};

export type CartBox = {
  boxSize: number; // 1 | 3 | 6
  items: CartItem[];
  total: number; // box total (authoritative)
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

      return { id, name, image, quantity, price };
    })
    .filter(Boolean) as CartItem[];

  if (normItems.length === 0) return null;

  const computed = normItems.reduce((sum, it) => sum + it.price * it.quantity, 0);

  return {
    boxSize,
    items: normItems,
    total: Number.isFinite(total) && total > 0 ? total : computed,
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
