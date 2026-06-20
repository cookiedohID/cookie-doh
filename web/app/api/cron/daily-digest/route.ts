// web/app/api/cron/daily-digest/route.ts
// Owner-facing autopilot: once each morning, WhatsApp the owner a summary of
// yesterday's sales + a "needs restock" list. Messages only the owner
// (ADMIN_NOTIFY_WHATSAPP), never customers — so it's safe to run unattended.
//
//   GET /api/cron/daily-digest                 (header x-cron-key: SECRET) -> send
//   GET /api/cron/daily-digest?dry=1           -> returns the composed text, sends nothing
import { NextResponse } from "next/server";
import { cronAuthorized, supaService } from "@/lib/cron";
import { LOCATIONS, getLocation, locationForOrder } from "@/lib/locations";
import { classifyItem } from "@/lib/loyalty";
import { FLAVORS } from "@/lib/catalog";
import { sendWhatsApp } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const maxDuration = 60;

const WIB = 7 * 3600 * 1000; // Asia/Jakarta = UTC+7 (no DST)
const LOW_STOCK = 5; // numeric-stock items at/below this are flagged
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NAME_BY_ID = new Map(FLAVORS.map((f) => [f.id, f.name]));

function idr(n: number): string {
  return "Rp" + Math.round(Number(n || 0)).toLocaleString("id-ID");
}

async function run(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const supa = supaService();

  // Yesterday, as a full Asia/Jakarta calendar day, expressed in UTC for the query.
  const yWib = new Date(Date.now() + WIB - 24 * 3600 * 1000);
  const Y = yWib.getUTCFullYear();
  const M = yWib.getUTCMonth();
  const D = yWib.getUTCDate();
  const fromIso = new Date(Date.UTC(Y, M, D, 0, 0, 0, 0) - WIB).toISOString();
  const toIso = new Date(Date.UTC(Y, M, D, 23, 59, 59, 999) - WIB).toISOString();
  const dateLabel = `${D} ${MONTHS[M]} ${Y}`;

  // ---- Yesterday's paid sales ----
  const { data: orderRows } = await supa
    .from("orders")
    .select("id, total_idr, items_json, meta, shipping_json, paid_at")
    .eq("payment_status", "PAID")
    .gte("paid_at", fromIso)
    .lte("paid_at", toIso)
    .limit(5000);

  const orders = (orderRows || []).map((o: any) => ({ ...o, _loc: locationForOrder(o) }));
  let revenue = 0;
  let freeCookies = 0;
  let freeDrinks = 0;
  const itemMap: Record<string, { name: string; qty: number }> = {};
  const locMap: Record<string, { orders: number; revenue: number }> = {};

  for (const o of orders) {
    const rev = Number(o.total_idr || 0);
    revenue += rev;
    locMap[o._loc] = locMap[o._loc] || { orders: 0, revenue: 0 };
    locMap[o._loc].orders += 1;
    locMap[o._loc].revenue += rev;
    for (const it of Array.isArray(o.items_json) ? o.items_json : []) {
      const id = String(it?.id || "");
      if (!id) continue;
      const qty = Math.max(0, Math.floor(Number(it?.quantity || 0)));
      if (!qty) continue;
      const name = String(it?.name || NAME_BY_ID.get(id) || id);
      itemMap[id] = itemMap[id] || { name, qty: 0 };
      itemMap[id].qty += qty;
      if (it?.free === true) {
        const k = classifyItem(id, it?.kind);
        if (k === "cookie") freeCookies += qty;
        else if (k === "drink") freeDrinks += qty;
      }
    }
  }
  const topItems = Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 5);

  // ---- Current low / sold-out stock across locations ----
  const { data: stockRows } = await supa.from("location_stock").select("location_id, item_id, stock, sold_out");
  const lowList = (stockRows || [])
    .map((r: any) => {
      const soldOut = Boolean(r.sold_out);
      const low = r.stock != null && Number(r.stock) <= LOW_STOCK;
      if (!soldOut && !low) return null;
      return {
        loc: getLocation(r.location_id)?.short || r.location_id,
        name: NAME_BY_ID.get(String(r.item_id)) || String(r.item_id),
        soldOut,
        stock: r.stock,
      };
    })
    .filter(Boolean) as { loc: string; name: string; soldOut: boolean; stock: number | null }[];
  lowList.sort((a, b) => (a.soldOut === b.soldOut ? 0 : a.soldOut ? -1 : 1));

  // ---- Compose ----
  const lines: string[] = [];
  lines.push("☀️ Cookie Doh — Daily Digest");
  lines.push(dateLabel);
  lines.push("");
  lines.push(`💰 Revenue: ${idr(revenue)}`);
  lines.push(`🧾 Orders: ${orders.length}`);

  if (topItems.length) {
    lines.push("");
    lines.push("🍪 Top sellers:");
    topItems.forEach((t, i) => lines.push(`${i + 1}. ${t.name} ×${t.qty}`));
  }

  const locLines = LOCATIONS.map((l) => ({ name: l.short, ...(locMap[l.id] || { orders: 0, revenue: 0 }) })).filter(
    (x) => x.orders > 0
  );
  if (locLines.length) {
    lines.push("");
    lines.push("📍 By store:");
    locLines.forEach((x) => lines.push(`• ${x.name}: ${x.orders} order${x.orders === 1 ? "" : "s"}, ${idr(x.revenue)}`));
  }

  if (freeCookies || freeDrinks) {
    lines.push("");
    lines.push(`🎁 Rewards redeemed: ${freeCookies} cookie${freeCookies === 1 ? "" : "s"}, ${freeDrinks} drink${freeDrinks === 1 ? "" : "s"}`);
  }

  lines.push("");
  if (lowList.length) {
    lines.push("⚠️ Needs restock:");
    lowList.slice(0, 30).forEach((x) => lines.push(`• ${x.loc} — ${x.name} ${x.soldOut ? "(SOLD OUT)" : `(only ${x.stock} left)`}`));
    if (lowList.length > 30) lines.push(`…and ${lowList.length - 30} more`);
  } else {
    lines.push("✅ All flavors in stock");
  }

  lines.push("");
  lines.push("Manage: https://www.cookiedoh.co.id/admin");
  const message = lines.join("\n");

  if (dry) {
    return NextResponse.json({ ok: true, dry: true, orders: orders.length, revenue, lowStock: lowList.length, message });
  }

  const res = await sendWhatsApp({ message }); // no `to` => goes to ADMIN_NOTIFY_WHATSAPP
  return NextResponse.json({
    ok: true,
    sent: res.ok,
    skipped: res.skipped || false,
    orders: orders.length,
    revenue,
    lowStock: lowList.length,
  });
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
