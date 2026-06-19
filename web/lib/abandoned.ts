// web/lib/abandoned.ts — find unpaid online orders worth a gentle WhatsApp nudge,
// and write the message. Server-only logic; the cron route wires it to the DB.
//
// Dedup ("already nudged") is the orders.nudged_at column, claimed atomically by
// the cron — see _RUN_abandoned_cart.sql. That guarantees one nudge per cart even
// if two cron runs overlap.

export const NUDGE_MIN_AGE_MS = 60 * 60 * 1000; // give them 1h to pay on their own first
// Cap at 12h: a default Snap token lives ~24h, so a 12h window leaves comfortable
// margin before the saved payment link goes stale.
export const NUDGE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const NUDGE_MAX_PER_RUN = 200; // safety cap per cron tick

export type AbandonedOrder = {
  id: string;
  order_no: string | number | null;
  customer_name: string | null;
  customer_phone: string | null;
  total_idr: number | null;
  created_at: string;
  meta: any;
  items_json: any;
};

// Only a real, resumable, online order is worth nudging. (Dedup is handled by the
// nudged_at column + atomic claim in the cron, not here.)
export function isNudgeable(o: AbandonedOrder): boolean {
  if (!o?.customer_phone) return false; // no way to reach them
  if (Number(o?.total_idr || 0) <= 0) return false; // free-only cart — nothing to pay
  if (o?.meta?.channel === "cafe") return false; // in-store POS, not a web cart
  if (!o?.meta?.midtrans?.token) return false; // no saved Snap token to resume payment
  return true;
}

function firstName(name: string | null): string {
  const n = (name || "").trim();
  return n ? n.split(/\s+/)[0] : "there";
}

function itemSummary(o: AbandonedOrder): string {
  const items = Array.isArray(o?.items_json) ? o.items_json : [];
  const names = items.map((it: any) => String(it?.name || "").trim()).filter(Boolean);
  if (!names.length) return "your treats";
  if (names.length <= 2) return names.join(" & ");
  return `${names.slice(0, 2).join(", ")} & more`;
}

export function buildNudgeText(o: AbandonedOrder, payUrl: string): string {
  const hi = firstName(o.customer_name);
  const what = itemSummary(o);
  const total = Number(o.total_idr || 0);
  const totalStr = total > 0 ? ` (Rp${total.toLocaleString("id-ID")})` : "";
  return [
    `Hi ${hi}! 🍪 You left ${what}${totalStr} in your cart at Cookie Doh — we saved it for you.`,
    ``,
    `Finish your order here (your saved payment link expires soon):`,
    payUrl,
    ``,
    `Any trouble? Just reply to this message and we'll help. 💛`,
  ].join("\n");
}
