"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CartItem, calcSubtotal, clearCart, getCart, removeCartItem, setCart, updateCartItemQuantity } from "@/lib/cart";

function formatIDR(n: number) {
  try {
    return new Intl.NumberFormat("id-ID").format(n);
  } catch {
    return String(n);
  }
}

export default function CartPage() {
  const router = useRouter();
  const [cart, setCartState] = useState<CartItem[]>([]);

  useEffect(() => {
    setCartState(getCart());
  }, []);

  const subtotal = useMemo(() => calcSubtotal(cart), [cart]);

  function syncCart(next: CartItem[]) {
    setCart(next);
    setCartState(next);
  }

  function inc(id: string) {
    const item = cart.find((x) => x.id === id);
    if (!item) return;
    updateCartItemQuantity(id, (item.quantity || 1) + 1);
    setCartState(getCart());
  }

  function dec(id: string) {
    const item = cart.find((x) => x.id === id);
    if (!item) return;
    updateCartItemQuantity(id, Math.max(1, (item.quantity || 1) - 1));
    setCartState(getCart());
  }

  function remove(id: string) {
    removeCartItem(id);
    setCartState(getCart());
  }

  function empty() {
    clearCart();
    setCartState([]);
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">Cookie Doh</div>
            <h1 className="text-2xl font-semibold">Your cart</h1>
          </div>

          <button
            className="rounded-md border px-4 py-2 text-sm"
            onClick={() => router.push("/build")}
            type="button"
          >
            Build a box
          </button>
        </div>

        {cart.length === 0 ? (
          <div className="rounded-xl border p-6">
            <div className="text-lg font-medium">Your cookie box is feeling lonely.</div>
            <div className="mt-2 text-sm text-gray-600">Build a box to add items into your cart.</div>

            <button
              className="mt-5 rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
              onClick={() => router.push("/build")}
              type="button"
            >
              Build a box
            </button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2 space-y-3">
              {cart.map((it) => (
                <div key={it.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{it.name}</div>
                      <div className="mt-1 text-sm text-gray-600">
                        IDR {formatIDR(it.price)} each
                      </div>
                    </div>

                    <button
                      className="text-sm underline"
                      onClick={() => remove(it.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button className="rounded-md border px-3 py-1" onClick={() => dec(it.id)} type="button">
                        -
                      </button>
                      <div className="min-w-[40px] text-center">{it.quantity}</div>
                      <button className="rounded-md border px-3 py-1" onClick={() => inc(it.id)} type="button">
                        +
                      </button>
                    </div>

                    <div className="text-sm font-semibold">
                      IDR {formatIDR(it.price * it.quantity)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-lg font-medium">Summary</div>

              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Subtotal</span>
                  <span>{formatIDR(subtotal)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t pt-3 text-base font-semibold">
                  <span>Total</span>
                  <span>{formatIDR(subtotal)}</span>
                </div>
              </div>

              <button
                className="mt-6 w-full rounded-md bg-black px-4 py-3 text-sm font-medium text-white"
                onClick={() => router.push("/checkout")}
                type="button"
              >
                Checkout
              </button>

              <button
                className="mt-2 w-full rounded-md border px-4 py-3 text-sm"
                onClick={empty}
                type="button"
              >
                Clear cart
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CartItem, calcSubtotal, clearCart, getCart, removeCartItem, setCart, updateCartItemQuantity } from "@/lib/cart";

function formatIDR(n: number) {
  try {
    return new Intl.NumberFormat("id-ID").format(n);
  } catch {
    return String(n);
  }
}

export default function CartPage() {
  const router = useRouter();
  const [cart, setCartState] = useState<CartItem[]>([]);

  useEffect(() => {
    setCartState(getCart());
  }, []);

  const subtotal = useMemo(() => calcSubtotal(cart), [cart]);

  function syncCart(next: CartItem[]) {
    setCart(next);
    setCartState(next);
  }

  function inc(id: string) {
    const item = cart.find((x) => x.id === id);
    if (!item) return;
    updateCartItemQuantity(id, (item.quantity || 1) + 1);
    setCartState(getCart());
  }

  function dec(id: string) {
    const item = cart.find((x) => x.id === id);
    if (!item) return;
    updateCartItemQuantity(id, Math.max(1, (item.quantity || 1) - 1));
    setCartState(getCart());
  }

  function remove(id: string) {
    removeCartItem(id);
    setCartState(getCart());
  }

  function empty() {
    clearCart();
    setCartState([]);
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">Cookie Doh</div>
            <h1 className="text-2xl font-semibold">Your cart</h1>
          </div>

          <button
            className="rounded-md border px-4 py-2 text-sm"
            onClick={() => router.push("/build")}
            type="button"
          >
            Build a box
          </button>
        </div>

        {cart.length === 0 ? (
          <div className="rounded-xl border p-6">
            <div className="text-lg font-medium">Your cookie box is feeling lonely.</div>
            <div className="mt-2 text-sm text-gray-600">Build a box to add items into your cart.</div>

            <button
              className="mt-5 rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
              onClick={() => router.push("/build")}
              type="button"
            >
              Build a box
            </button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2 space-y-3">
              {cart.map((it) => (
                <div key={it.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{it.name}</div>
                      <div className="mt-1 text-sm text-gray-600">
                        IDR {formatIDR(it.price)} each
                      </div>
                    </div>

                    <button
                      className="text-sm underline"
                      onClick={() => remove(it.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button className="rounded-md border px-3 py-1" onClick={() => dec(it.id)} type="button">
                        -
                      </button>
                      <div className="min-w-[40px] text-center">{it.quantity}</div>
                      <button className="rounded-md border px-3 py-1" onClick={() => inc(it.id)} type="button">
                        +
                      </button>
                    </div>

                    <div className="text-sm font-semibold">
                      IDR {formatIDR(it.price * it.quantity)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-lg font-medium">Summary</div>

              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Subtotal</span>
                  <span>{formatIDR(subtotal)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t pt-3 text-base font-semibold">
                  <span>Total</span>
                  <span>{formatIDR(subtotal)}</span>
                </div>
              </div>

              <button
                className="mt-6 w-full rounded-md bg-black px-4 py-3 text-sm font-medium text-white"
                onClick={() => router.push("/checkout")}
                type="button"
              >
                Checkout
              </button>

              <button
                className="mt-2 w-full rounded-md border px-4 py-3 text-sm"
                onClick={empty}
                type="button"
              >
                Clear cart
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
