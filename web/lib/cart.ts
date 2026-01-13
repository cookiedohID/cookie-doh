// web/lib/cart.ts
export type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
};

export type CartBox = {
  boxSize: number;
  items: CartItem[];
  total: number;
};

type CartState = {
  boxes: CartBox[];
};

const KEY = "cookie_doh_cart_v1";

function readCart(): CartState {
  if (typeof window === "undefined") return { boxes: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { boxes: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.boxes)) return { boxes: [] };
    return parsed as CartState;
  } catch {
    return { boxes: [] };
  }
}

function writeCart(state: CartState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function addBoxToCart(box: CartBox) {
  const cart = readCart();
  cart.boxes.unshift(box);
  writeCart(cart);
}

export function getCart(): CartState {
  return readCart();
}

export function clearCart() {
  writeCart({ boxes: [] });
}
