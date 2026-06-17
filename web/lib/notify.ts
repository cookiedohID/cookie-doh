// web/lib/notify.ts
//
// Orchestrates admin notifications (email + WhatsApp) for a new order.
// Safe to call fire-and-forget style: it never throws.

import { sendNewOrderEmail } from "@/lib/email";
import { sendWhatsApp } from "@/lib/whatsapp";

function formatIDR(n?: number | null) {
  if (typeof n !== "number") return "-";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

function itemsToLines(order: NewOrderInput): string[] {
  if (order.boxesText && order.boxesText.trim()) {
    return order.boxesText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(order.items) && order.items.length) {
    return order.items.map(
      (it) => `- ${it.name ?? "Item"} ×${Number(it.quantity ?? 1)}`
    );
  }
  return [];
}

export type NewOrderInput = {
  orderNo: string;
  status?: "placed" | "paid";
  customerName?: string | null;
  customerPhone?: string | null;
  fulfilment?: string | null;
  scheduleDate?: string | null;
  scheduleTime?: string | null;
  totalIdr?: number | null;
  items?: Array<{ name?: string; quantity?: number }>;
  boxesText?: string | null;
  adminUrl?: string | null;
};

function buildWaMessage(order: NewOrderInput): string {
  const head = order.status === "paid" ? "✅ ORDER PAID" : "🍪 NEW ORDER";
  const lines: string[] = [];
  lines.push(`${head} — ${order.orderNo}`);
  if (order.status !== "paid") lines.push("(awaiting payment)");
  lines.push("");
  lines.push(`Customer: ${order.customerName || "-"}`);
  lines.push(`Phone: ${order.customerPhone || "-"}`);
  lines.push(`Total: ${formatIDR(order.totalIdr)}`);
  const sched = [order.scheduleDate, order.scheduleTime].filter(Boolean).join(" • ");
  if (order.fulfilment || sched) {
    lines.push(`Fulfilment: ${[order.fulfilment, sched].filter(Boolean).join(" • ")}`);
  }
  const itemLines = itemsToLines(order);
  if (itemLines.length) {
    lines.push("");
    lines.push("Items:");
    itemLines.forEach((l) => lines.push(l.startsWith("-") ? l : `- ${l}`));
  }
  if (order.adminUrl) {
    lines.push("");
    lines.push(`Open: ${order.adminUrl}`);
  }
  return lines.join("\n");
}

/** Send admin email + WhatsApp for a new order. Never throws. */
export async function notifyNewOrder(order: NewOrderInput): Promise<void> {
  const results = await Promise.allSettled([
    sendNewOrderEmail({
      orderNo: order.orderNo,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      fulfilment: order.fulfilment,
      scheduleDate: order.scheduleDate,
      scheduleTime: order.scheduleTime,
      totalIdr: order.totalIdr,
      adminUrl: order.adminUrl,
    }),
    sendWhatsApp({ message: buildWaMessage(order) }),
  ]);

  results.forEach((r) => {
    if (r.status === "rejected") console.error("[notify] channel failed:", r.reason);
  });
}
