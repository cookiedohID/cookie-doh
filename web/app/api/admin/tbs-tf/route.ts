// web/app/api/admin/tbs-tf/route.ts — Tukar Faktur Cabang (branch settlement
// invoice) data for ONE TotalBuahStore store over a period.
//
// Marketplace model: Cookie Doh collects TBS web-shop money, so per period it
// OWES each store the goods + delivery it collected, MINUS Cookie Doh's
// marketplace fee (fee % × goods value). This endpoint returns the order-level
// lines + totals; /admin/tbs-tf renders the printable document both companies
// book against. Stateless + deterministic: same period ⇒ same TF number and
// (once the month is closed) the same figures — regenerate anytime.
// Gated like all /api/admin/* by the cd_admin cookie (proxy.ts).
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTbsFeePct } from "@/lib/settings";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

const dayWib = (iso: string | null) => {
  const t = Date.parse(String(iso || ""));
  return Number.isFinite(t) ? new Date(t + 7 * 3600 * 1000).toISOString().slice(0, 10) : "";
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const store = String(url.searchParams.get("store") || "").toUpperCase();
    if (!/^[A-Z0-9-]{2,20}$/.test(store)) return NextResponse.json({ ok: false, error: "store required" }, { status: 400 });
    const today = new Date().toISOString().slice(0, 10);
    const from = (url.searchParams.get("from") || today.slice(0, 8) + "01").slice(0, 10);
    const to = (url.searchParams.get("to") || today).slice(0, 10);
    const supaEarly = supaAdmin();
    const feePct = await getTbsFeePct(supaEarly, url.searchParams.get("tbs_fee_pct"));

    // WIB day boundaries → UTC query window (WIB = UTC+7, no DST)
    const fromIso = new Date(Date.parse(`${from}T00:00:00.000Z`) - 7 * 3600 * 1000).toISOString();
    const toIso = new Date(Date.parse(`${to}T23:59:59.999Z`) - 7 * 3600 * 1000).toISOString();

    const supa = supaEarly;
    const { data: rows } = await supa
      .from("orders")
      .select("id, order_no, paid_at, created_at, total_idr, items_json, meta")
      .eq("payment_status", "PAID")
      .gte("paid_at", fromIso)
      .lte("paid_at", toIso)
      .order("paid_at", { ascending: true })
      .limit(5000);

    const lines: Array<{ date: string; order_id: string; order_no: any; fulfil: string; items_idr: number; delivery_idr: number; fee_idr: number; points_idr: number; net_idr: number }> = [];
    for (const o of rows || []) {
      const t = (o as any)?.meta?.tbs;
      if (!t?.store || String(t.store).toUpperCase() !== store) continue;
      // points the customer redeemed on this order (store honored them — CD
      // collected that much less cash, so it comes off the transfer; the store
      // recovers it from funding stores via the inter-store points ledger)
      const tp = (o as any)?.meta?.tbs_points;
      const pointsUsed = tp?.redeemed === true ? Math.max(0, Math.round(Number(tp.discount) || 0)) : 0;
      const delivery = Math.round(Number(t.delivery_fee) || 0);
      const total = Math.round(Number((o as any).total_idr) || 0);
      const goods = (Array.isArray((o as any).items_json) ? (o as any).items_json : [])
        .filter((it: any) => it?.kind === "tbs")
        .reduce((n: number, it: any) => n + Math.round((Number(it.price) || 0) * (Number(it.quantity) || 1)), 0);
      const itemsResolved = goods > 0 ? goods : Math.max(0, total - delivery);
      const fee = Math.round((itemsResolved * feePct) / 100);
      lines.push({
        date: dayWib((o as any).paid_at || (o as any).created_at),
        order_id: String((o as any).id), order_no: (o as any).order_no ?? null,
        fulfil: t.mixed ? "mixed (with Cookie Doh)" : t.fulfil === "delivery" ? "delivery" : "pickup",
        items_idr: itemsResolved, delivery_idr: delivery, fee_idr: fee, points_idr: pointsUsed,
        net_idr: itemsResolved + delivery - fee - pointsUsed,
      });
    }

    const sum = (k: "items_idr" | "delivery_idr" | "fee_idr" | "points_idr" | "net_idr") => lines.reduce((n, l) => n + l[k], 0);
    // Deterministic TF number: calendar month → TFC-<store>-<YYYYMM>, otherwise the full range.
    const isMonth = from.slice(8) === "01" && to === new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const tfNo = isMonth
      ? `TFC-${store.replace(/^TBS-/, "")}-${from.slice(0, 7).replace("-", "")}`
      : `TFC-${store.replace(/^TBS-/, "")}-${from.replace(/-/g, "")}-${to.replace(/-/g, "")}`;

    return NextResponse.json({
      ok: true,
      tf: {
        tf_no: tfNo, store, period: { from, to }, fee_pct: feePct,
        lines,
        totals: {
          orders: lines.length,
          items_idr: sum("items_idr"),
          delivery_idr: sum("delivery_idr"),
          gross_idr: sum("items_idr") + sum("delivery_idr"),
          fee_idr: sum("fee_idr"),
          points_idr: sum("points_idr"),
          net_idr: sum("net_idr"),
        },
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
