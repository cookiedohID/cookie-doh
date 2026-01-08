"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT || "6281932181818";
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hello@cookiedoh.co.id";

function waLink(text: string) {
  const msg = encodeURIComponent(text);
  return `https://wa.me/6281932181818`;
}

export default function SuccessClient() {
  const sp = useSearchParams();
  const [copied, setCopied] = useState(false);

  const orderId = useMemo(() => {
    return sp.get("order_id") || sp.get("orderId") || sp.get("id") || "";
  }, [sp]);

  async function copyOrderId() {
    if (!orderId) return;
    try {
      await navigator.clipboard.writeText(orderId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  const supportMsg = orderId
    ? `Hi Cookie Doh, I need help with my order. Order ID: ${orderId}`
    : `Hi Cookie Doh, I need help with my order.`;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Payment successful 🎉</h1>
            <p className="mt-2 text-sm text-neutral-600">
              We’ve received your payment. We’ll prepare your cookies and arrange shipping.
            </p>
          </div>
          <div className="rounded-2xl bg-black px-3 py-2 text-xs font-medium text-white">
            Success
          </div>
        </div>

        <div className="mt-6 rounded-2xl border bg-neutral-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs text-neutral-500">Order ID</div>
              <div className="mt-1 font-mono text-sm">{orderId || "—"}</div>
            </div>
            <button
              onClick={copyOrderId}
              disabled={!orderId}
              className="rounded-xl border bg-white px-4 py-2 text-sm font-medium shadow-sm transition hover:bg-neutral-100 disabled:opacity-50"
            >
              {copied ? "Copied ✅" : "Copy Order ID"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <a
            href={waLink(supportMsg)}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl bg-black px-5 py-3 text-center text-sm font-semibold text-white transition hover:opacity-90"
          >
            WhatsApp Support
          </a>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Order Support")}&body=${encodeURIComponent(supportMsg)}`}
            className="rounded-2xl border bg-white px-5 py-3 text-center text-sm font-semibold transition hover:bg-neutral-100"
          >
            Email Support
          </a>
        </div>

        <div className="mt-6 text-xs text-neutral-500">
          Tip: Keep your Order ID for faster support and tracking.
        </div>
      </div>
    </div>
  );
}
