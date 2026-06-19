// web/lib/broadcast.ts — work out who a WhatsApp broadcast goes to, by segment.
// Server-only (queries with the service role). The recipient pool is everyone in
// the PAID sales history (even non-members) plus registered members.
import { phoneSignificant, canonicalPhone } from "@/lib/phone";

export type Segment = "all" | "active" | "lapsed" | "vip";

export const SEGMENTS: { key: Segment; label: string; hint: string }[] = [
  { key: "all", label: "Everyone", hint: "Every customer who's ordered + all members" },
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
    .select("customer_phone, customer_name, total_idr, paid_at")
    .eq("payment_status", "PAID")
    .limit(20000);

  // Opt-outs — graceful if the table isn't created yet.
  let optedOut = new Set<string>();
  try {
    const { data: outs } = await supa.from("broadcast_optouts").select("phone");
    optedOut = new Set((outs || []).map((o: any) => phoneSignificant(o.phone)).filter(Boolean));
  } catch { /* table optional */ }

  // The recipient pool = everyone who's ever paid + every registered member,
  // keyed by significant phone so the same person isn't messaged twice.
  const pool = new Map<string, { phone: string; name: string | null; spend: number; count: number; last: number }>();
  const touch = (rawPhone: any, rawName: any) => {
    const sig = phoneSignificant(rawPhone);
    if (!sig) return null;
    let p = pool.get(sig);
    if (!p) {
      const phone = canonicalPhone(rawPhone) || String(rawPhone);
      p = { phone, name: (rawName || "").trim() || null, spend: 0, count: 0, last: 0 };
      pool.set(sig, p);
    } else if (!p.name && rawName) {
      p.name = String(rawName).trim() || null;
    }
    return { sig, p };
  };

  // Sales history first — captures buyers who never registered as members.
  for (const o of orders || []) {
    const hit = touch(o?.customer_phone, o?.customer_name);
    if (!hit) continue;
    hit.p.spend += Number(o?.total_idr || 0);
    hit.p.count += 1;
    const t = o?.paid_at ? new Date(o.paid_at).getTime() : 0;
    if (t > hit.p.last) hit.p.last = t;
  }
  // Then registered members (adds members who haven't ordered yet; fills in names).
  for (const c of customers || []) touch(c?.phone, c?.name);

  const now = Date.now();
  const out: Recipient[] = [];
  for (const [sig, p] of pool) {
    if (optedOut.has(sig)) continue;
    let include = false;
    if (segment === "all") include = true;
    else if (segment === "active") include = p.last > 0 && now - p.last <= ACTIVE_DAYS * DAY;
    else if (segment === "lapsed") include = p.last > 0 && now - p.last > LAPSED_DAYS * DAY;
    else if (segment === "vip") include = p.count >= VIP_MIN_ORDERS || p.spend >= VIP_MIN_SPEND;
    if (include) out.push({ phone: p.phone, name: p.name });
  }
  return out;
}

// Personalise {name} and append the opt-out footer (good-practice + WhatsApp policy).
export function buildBroadcastText(message: string, name: string | null): string {
  const body = message.replace(/\{name\}/gi, (name || "there").trim() || "there");
  return `${body}\n\n—\nReply STOP to opt out.`;
}
