"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT || "6281932181818";
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hello@cookiedoh.co.id";

// ✅ EDIT to your real payment info
const PAYMENT_INSTRUCTIONS = [
  "Manual Payment Instructions",
  "",
  "1) Transfer to:",
  "   BCA: 622-0372918 a/n Angelia Tania",
  "   OR QRIS: (CHANGE THIS)",
  "",
  "2) Send proof of transfer to WhatsApp:",
  `   0819-32-181818`,
  "",
  "3) We will confirm & process your order after payment is received.",
].join("\n");

function formatIDR(n?: number | null) {
  if (typeof n !== "number") return "-";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function waLink(text: string) {
  const msg = encodeURIComponent(text);
  return `https://wa.me/${WHATSAPP}?text=${msg}`;
}

function normalizeItems(itemsJson: any): Array<{ name: string; qty: number; price?: number }> {
  let items: any = itemsJson;

  if (typeof itemsJson === "string") {
    try {
      items = JSON.parse(itemsJson);
    } catch {
      items = null;
    }
  }

  // Most likely: array of MidtransItem {name, price, quantity}
  if (Array.isArray(items)) {
    return items.map((it) => ({
      name: String(it?.name ?? it?.title ?? "Item"),
      qty: Number(it?.quantity ?? it?.qty ?? 1),
      price: typeof it?.price === "number" ? it.price : undefined,
    }));
  }

  // Sometimes: {items:[...]}
  if (items && Array.isArray(items.items)) {
    return items.items.map((it: any) => ({
      name: String(it?.name ?? it?.title ?? "Item"),
      qty: Number(it?.quantity ?? it?.qty ?? 1),
      price: typeof it?.price === "number" ? it.price : undefined,
    }));
  }

  return [];
}

export default function PendingClient() {
  const sp = useSearchParams();

  const orderId = useMemo(() => {
    return sp.get("order_id") || sp.get("orderId") || sp.get("id") || "";
  }, [sp]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [order, setOrder] = useState<any>(null);

  const [copiedId, setCopiedId] = useState(false);
  const [copiedPay, setCopiedPay] = useState(false);

  useEffect(() => {
    if (!orderId) return;

    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/orders/lookup?order_id=${encodeURIComponent(orderId)}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Failed to load order");
        if (alive) setOrder(json.order);
      } catch (e: any) {
        if (alive) setErr(e?.message ?? "Failed to load order");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [orderId]);

  const items = useMemo(() => normalizeItems(order?.items_json), [order?.items_json]);

  async function copyOrderId() {
    if (!orderId) return;
    try {
      await navigator.clipboard.writeText(orderId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1200);
    } catch {}
  }

  async function copyPayment() {
    try {
      await navigator.clipboard.writeText(PAYMENT_INSTRUCTIONS);
      setCopiedPay(true);
      setTimeout(() => setCopiedPay(false), 1200);
    } catch {}
  }

  const waMessage = useMemo(() => {
    const name = String(order?.customer_name ?? "").trim();
    const phone = String(order?.customer_phone ?? "").trim();
    const address = String(order?.shipping_address ?? order?.address ?? "").trim();
    const area = String(order?.destination_area_label ?? "").trim();
    const postal = String(order?.postal ?? "").trim();
    const orderNo = String(order?.order_no ?? "").trim();

    const total = typeof order?.total_idr === "number" ? formatIDR(order.total_idr) : "-";

    const itemLines =
      items.length > 0
        ? items.map((it) => `• ${it.name} x${it.qty}`).join("\n")
        : "• (items not available)";

    const fullAddr = [address, area ? `(${area})` : "", postal ? `Postal: ${postal}` : ""].filter(Boolean).join(" ");

    return [
      `Hi Cookie Doh 👋`,
      ``,
      `I want to confirm my payment for this order:`,
      `Order No: ${orderNo || "-"}`,
      `Order ID: ${orderId}`,
      ``,
      `Name: ${name || "-"}`,
      `Phone: ${phone || "-"}`,
      `Address: ${fullAddr || "-"}`,
      ``,
      `Order items:`,
      itemLines,
      ``,
      `Total: ${total}`,
      ``,
      `I will send payment proof here. Thank you 🙏`,
    ].join("\n");
  }, [order, orderId, items]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Order placed · Payment pending ⏳</h1>
            <p className="mt-2 text-sm text-neutral-600">
              Please complete payment using the instructions below, then send proof via WhatsApp.
            </p>
          </div>
          <div className="rounded-2xl bg-neutral-900 px-3 py-2 text-xs font-medium text-white">Pending</div>
        </div>

        {/* Order ID */}
        <div className="mt-6 rounded-2xl border bg-neutral-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs text-neutral-500">Order ID</div>
              <div className="mt-1 font-mono text-sm">{orderId || "—"}</div>
              {order?.order_no ? (
                <div className="mt-1 text-xs text-neutral-500">Order No: {order.order_no}</div>
              ) : null}
            </div>

            <button
              onClick={copyOrderId}
              disabled={!orderId}
              className="rounded-xl border bg-white px-4 py-2 text-sm font-medium shadow-sm transition hover:bg-neutral-100 disabled:opacity-50"
            >
              {copiedId ? "Copied ✅" : "Copy Order ID"}
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="mt-6 rounded-2xl border bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-neutral-800">Order Summary</div>
            {loading ? <div className="text-xs text-neutral-500">Loading…</div> : null}
          </div>

          {err ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
          ) : null}

          {!err && order ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-xl bg-neutral-50 p-3">
                <div className="text-xs text-neutral-500">Delivery</div>
                <div className="mt-1 text-sm">
                  <div className="font-medium">{order.customer_name}</div>
                  <div className="text-neutral-700">{order.customer_phone}</div>
                  <div className="mt-1 text-neutral-700">
                    {order.shipping_address || order.address}
                    {order.destination_area_label ? ` (${order.destination_area_label})` : ""}
                    {order.postal ? ` · ${order.postal}` : ""}
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-neutral-50 p-3">
                <div className="text-xs text-neutral-500">Items</div>
                <div className="mt-2 space-y-2">
                  {items.length > 0 ? (
                    items.map((it, idx) => (
                      <div key={idx} className="flex items-start justify-between gap-3">
                        <div className="text-sm text-neutral-800">{it.name}</div>
                        <div className="text-sm font-medium text-neutral-900">x{it.qty}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-neutral-600">Items not available.</div>
                  )}
                </div>

                <div className="mt-3 border-t pt-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Subtotal</span>
                    <span className="font-medium">{formatIDR(order.subtotal_idr)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Shipping</span>
                    <span className="font-medium">{formatIDR(order.shipping_cost_idr)}</span>
                  </div>
                  <div className="mt-2 flex justify-between text-base">
                    <span className="font-semibold">Total</span>
                    <span className="font-semibold">{formatIDR(order.total_idr)}</span>
                  </div>
                </div>
              </div>

              {order.notes ? (
                <div className="rounded-xl bg-neutral-50 p-3">
                  <div className="text-xs text-neutral-500">Notes</div>
                  <div className="mt-1 text-sm text-neutral-800">{order.notes}</div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Payment instructions */}
        <div className="mt-6 rounded-2xl border bg-white p-4">
          <div className="text-xs font-semibold text-neutral-700">Payment Instructions</div>
          <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-neutral-50 p-3 text-xs text-neutral-700">
            {PAYMENT_INSTRUCTIONS}
          </pre>

          <button
            onClick={copyPayment}
            className="mt-3 w-full rounded-2xl border bg-white px-5 py-3 text-center text-sm font-semibold transition hover:bg-neutral-100"
          >
            {copiedPay ? "Copied ✅" : "Copy Payment Instructions"}
          </button>
        </div>

        {/* CTA buttons */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <a
            href={waLink(waMessage)}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl bg-black px-5 py-3 text-center text-sm font-semibold text-white transition hover:opacity-90"
          >
            Send Proof via WhatsApp (Auto-filled)
          </a>

          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Manual Payment Proof")}&body=${encodeURIComponent(waMessage)}`}
            className="rounded-2xl border bg-white px-5 py-3 text-center text-sm font-semibold transition hover:bg-neutral-100"
          >
            Email Support
          </a>
        </div>

        <div className="mt-4 text-xs text-neutral-500">
          Tip: Use the WhatsApp button so we can verify faster (it includes your order details automatically).
        </div>
      </div>
    </div>
  );
}
