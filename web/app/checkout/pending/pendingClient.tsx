"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT || "6281932181818";
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hello@cookiedoh.co.id";

// ✅ EDIT THIS to your real payment details
const PAYMENT_INSTRUCTIONS = [
  "Manual Payment Instructions",
  "",
  "1) Transfer to:",
  "   BCA: 622-0372918 a/n Angelia Tania",
 
  "",
  "2) Send proof of transfer to WhatsApp:",
  `   wa.me/6281932181818`,
  "",
  "3) We will confirm & process your order after payment is received.",
].join("\n");

function waLink(text: string) {
  const msg = encodeURIComponent(text);
  return `https://wa.me/6281932181818`;
}

export default function PendingClient() {
  const sp = useSearchParams();
  const [copied, setCopied] = useState(false);
  const [copiedPay, setCopiedPay] = useState(false);

  const orderId = useMemo(() => {
    return sp.get("order_id") || sp.get("orderId") || sp.get("id") || "";
  }, [sp]);

  async function copyOrderId() {
    if (!orderId) return;
    try {
      await navigator.clipboard.writeText(orderId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  async function copyPayment() {
    try {
      await navigator.clipboard.writeText(PAYMENT_INSTRUCTIONS);
      setCopiedPay(true);
      setTimeout(() => setCopiedPay(false), 1200);
    } catch {}
  }

  const supportMsg = orderId
    ? `Hi Cookie Doh, I’ve placed an order (manual payment). Order ID: ${orderId}. I will send payment proof here.`
    : `Hi Cookie Doh, I’ve placed an order (manual payment). I will send payment proof here.`;

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

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <a
            href={waLink(supportMsg)}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl bg-black px-5 py-3 text-center text-sm font-semibold text-white transition hover:opacity-90"
          >
            Send Proof via WhatsApp
          </a>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Manual Payment Proof")}&body=${encodeURIComponent(supportMsg)}`}
            className="rounded-2xl border bg-white px-5 py-3 text-center text-sm font-semibold transition hover:bg-neutral-100"
          >
            Email Support
          </a>
        </div>
      </div>
    </div>
  );
}
