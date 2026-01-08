// web/lib/cart.ts
export type CartItem = {
  id: string;
  name: string;
  price: number; // IDR integer
  quantity: number;
  meta?: any; // optional (for storing flavours/size)
};

const CART_KEY = "cookie-doh-cart";

export function getCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(CART_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.items)) return parsed.items;
    return [];
  } catch {
    return [];
  }
}

export function setCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export function clearCart() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CART_KEY);
}

export function addCartItem(item: CartItem) {
  const cart = getCart();
  cart.push(item);
  setCart(cart);
}

export function updateCartItemQuantity(id: string, quantity: number) {
  const q = Math.max(1, Math.round(quantity));
  const cart = getCart().map((it) => (it.id === id ? { ...it, quantity: q } : it));
  setCart(cart);
}

export function removeCartItem(id: string) {
  const cart = getCart().filter((it) => it.id !== id);
  setCart(cart);
}

export function calcSubtotal(items: CartItem[]) {
  return items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);
}
