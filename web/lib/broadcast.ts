// web/lib/broadcast.ts — work out who a WhatsApp broadcast goes to, by segment.
// Server-only (queries with the service role).
import { phoneSignificant } from "@/lib/phone";

export type Segment = "all" | "active" | "lapsed" | "vip";

export const SEGMENTS: { key: Segment; label: string; hint: string }[] = [
  { key: "all", label: "All members", hint: "Everyone with a phone on file" },
  { key: "active", label: "Active (last 30 days)", hint: "Ordered recently" },
  { key: "lapsed", label: "Lapsed (45+ days)", hint: "Ordered before, gone quiet" },
  { key: "vip", label: "VIPs", hint: "3+ orders or Rp300k+ spent" },
];

const ACTIVE_DAYS = 30;
const LAPSED_DAYS = 45;
const VIP_MIN_ORDERS = 3;
const VIP_MIN_SPEND = 300_000;
const DAY = 86_400_000;

export type Recipient = { phone: string; name: string | null };

export async function getBroadcastRecipients(supa: any, segment: Segment): Promise<Recipient[]> {
  const { data: customers } = await supa.from("customers").select("phone, name").not("phone", "is", null);
  const { data: orders } = await supa
    .from("orders")
    .select("customer_phone, total_idr, paid_at")
    .eq("payment_status", "PAID")
    .limit(5000);

  // Opt-outs — graceful if the table isn't created yet.
  let optedOut = new Set<string>();
  try {
    const { data: outs } = await supa.from("broadcast_optouts").select("phone");
    optedOut = new Set((outs || []).map((o: any) => phoneSignificant(o.phone)).filter(Boolean));
  } catch { /* table optional */ }

  // Aggregate paid orders per (significant) phone.
  const agg: Record<string, { spend: number; count: number; last: number }> = {};
  for (const o of orders || []) {
    const sig = phoneSignificant(o?.customer_phone);
    if (!sig) continue;
    const a = (agg[sig] ||= { spend: 0, count: 0, last: 0 });
    a.spend += Number(o?.total_idr || 0);
    a.count += 1;
    const t = o?.paid_at ? new Date(o.paid_at).getTime() : 0;
    if (t > a.last) a.last = t;
  }

  const now = Date.now();
  const out: Recipient[] = [];
  const seen = new Set<string>();
  for (const c of customers || []) {
    const sig = phoneSignificant(c?.phone);
    if (!sig || seen.has(sig) || optedOut.has(sig)) continue;
    const a = agg[sig] || { spend: 0, count: 0, last: 0 };
    let include = false;
    if (segment === "all") include = true;
    else if (segment === "active") include = a.last > 0 && now - a.last <= ACTIVE_DAYS * DAY;
    else if (segment === "lapsed") include = a.last > 0 && now - a.last > LAPSED_DAYS * DAY;
    else if (segment === "vip") include = a.count >= VIP_MIN_ORDERS || a.spend >= VIP_MIN_SPEND;
    if (include) { out.push({ phone: c.phone, name: c?.name || null }); seen.add(sig); }
  }
  return out;
}

// Personalise {name} and append the opt-out footer (good-practice + WhatsApp policy).
export function buildBroadcastText(message: string, name: string | null): string {
  const body = message.replace(/\{name\}/gi, (name || "there").trim() || "there");
  return `${body}\n\n—\nReply STOP to opt out.`;
}
