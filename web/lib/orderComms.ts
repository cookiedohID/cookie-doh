// web/lib/orderComms.ts — order-related WhatsApp messages.
//   • notifyCustomerOrderConfirmed  — auto-reply to the customer when paid
//   • notifyCustomerOnTheWay        — "your order is on its way" + track link
//   • remindUnacceptedOrders        — hourly nudge to the OWNER until they accept
import { sendWhatsApp } from "@/lib/whatsapp";

function idr(n: any) { return "Rp" + Math.round(Number(n || 0)).toLocaleString("id-ID"); }

function itemLines(order: any): string {
  const items = Array.isArray(order?.items_json) ? order.items_json : [];
  const lines = items
    .filter((it: any) => Number(it?.quantity) > 0)
    .map((it: any) => `• ${it?.name || "Item"} ×${it?.quantity}${it?.free ? " (free)" : ""}`);
  if (lines.length) return lines.join("\n");
  return String(order?.meta?.boxes_text || "").trim();
}

// Auto-reply to the customer confirming their order details (sent on payment).
export async function notifyCustomerOrderConfirmed(order: any): Promise<void> {
  const to = order?.customer_phone;
  if (!to) return;
  const ref = order?.order_no ? ` #${order.order_no}` : "";
  const lines = [
    `Hi${order?.customer_name ? " " + order.customer_name : ""}! 🍪 We've received your Cookie Doh order${ref}.`,
    "",
    itemLines(order),
    "",
    `Total: ${idr(order?.total_idr)}`,
    order?.fulfilment_status ? `Type: ${order.fulfilment_status}` : "",
    "",
    "We'll let you know the moment it's on the way. Thank you for ordering with us! 💛",
  ].filter(Boolean);
  try { await sendWhatsApp({ to, message: lines.join("\n") }); }
  catch (e) { console.error("[orderComms] confirm send failed:", e); }
}

// "On its way" + tracking link — triggered by the owner from the order page.
export async function notifyCustomerOnTheWay(order: any): Promise<{ ok: boolean; error?: string }> {
  const to = order?.customer_phone;
  if (!to) return { ok: false, error: "This order has no customer phone number." };
  const ref = order?.order_no ? ` #${order.order_no}` : "";
  const track = order?.tracking_url || order?.meta?.tracking_url || "";
  const lines = [
    `🎉 Yay${order?.customer_name ? ", " + order.customer_name : ""}! Your Cookie Doh order${ref} is freshly baked, packed with love, and on its way to you 🍪🚚`,
    "",
    "Keep an eye out — something delicious is about to land at your door 🥰",
    track ? `📍 Track your delivery here: ${track}` : "",
    "",
    "Thank you for ordering with us — we hope every bite makes your day a little sweeter 💛",
    "where the cookie magic happens ✨",
  ].filter(Boolean);
  const res = await sendWhatsApp({ to, message: lines.join("\n") });
  return { ok: !!res.ok, error: res.ok ? undefined : "WhatsApp send failed (check Fonnte settings)." };
}

// Hourly: ONE consolidated reminder to the owner listing PAID orders that still
// aren't accepted (created within the last 24h, so it stops nagging eventually).
// Cafe + subscription orders are auto-fulfilled and never need acceptance.
export async function remindUnacceptedOrders(
  supa: any,
  siteUrl: string,
  dry: boolean
): Promise<{ pending: number; sent: boolean }> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: orders } = await supa
    .from("orders")
    .select("id, order_no, customer_name, customer_phone, total_idr, created_at, fulfilment_status, meta, checkout_mode")
    .eq("payment_status", "PAID")
    .is("accepted_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(100);

  const pending = (orders || []).filter(
    (o: any) => o?.checkout_mode !== "subscription" && o?.meta?.channel !== "cafe" && o?.meta?.channel !== "subscription"
  );

  if (!pending.length || dry) return { pending: pending.length, sent: false };

  const lines = ["⏰ Orders awaiting your acceptance:", ""];
  for (const o of pending.slice(0, 20)) {
    const ageH = Math.max(0, Math.floor((Date.now() - new Date(o.created_at).getTime()) / 3600000));
    lines.push(`• #${o.order_no || o.id} — ${o.customer_name || o.customer_phone || "customer"} — ${idr(o.total_idr)} — ${ageH}h ago`);
  }
  if (pending.length > 20) lines.push(`…and ${pending.length - 20} more`);
  lines.push("", `Review & accept: ${siteUrl}/admin/orders`);

  const res = await sendWhatsApp({ message: lines.join("\n") }); // owner (ADMIN_NOTIFY_WHATSAPP)
  return { pending: pending.length, sent: !!res.ok };
}
