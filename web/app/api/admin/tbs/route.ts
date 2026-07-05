// web/app/api/admin/tbs/route.ts — data + actions for the Admin → TBS hub.
// GET: shop status, ERP/store health, month-to-date money, recent TBS orders
// with their back-office push status. POST {action:"retry_push", order_id}:
// re-push a paid order whose hand-off to the TBS back-office failed (safe —
// the ERP dedups on event_id, so a double push returns the same order).
// Gated like all /api/admin/* by the cd_admin cookie (proxy.ts).
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { tbsShopPublic, tbsBackofficeOrigin, partnerGet, pushTbsOrder, TBS_PREVIEW_KEY } from "@/lib/tbsShop";
import { getTbsFeePct } from "@/lib/settings";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  try {
    const supa = supaAdmin();
    const [pub, feePct, storesRes] = await Promise.all([
      tbsShopPublic(),
      getTbsFeePct(supa, null),
      partnerGet("/stores", {}).catch(() => null),
    ]);

    // month-to-date (WIB) TBS money
    const now = Date.now();
    const wibNow = new Date(now + 7 * 3600 * 1000);
    const monthStartWib = `${wibNow.toISOString().slice(0, 8)}01T00:00:00.000Z`;
    const fromIso = new Date(Date.parse(monthStartWib) - 7 * 3600 * 1000).toISOString();
    const { data: paidRows } = await supa
      .from("orders")
      .select("total_idr, items_json, meta")
      .eq("payment_status", "PAID")
      .gte("paid_at", fromIso)
      .limit(5000);
    let mOrders = 0, mGoods = 0, mFee = 0;
    for (const o of paidRows || []) {
      const t = (o as any)?.meta?.tbs;
      if (!t?.store) continue;
      const delivery = Math.round(Number(t.delivery_fee) || 0);
      const goods = (Array.isArray((o as any).items_json) ? (o as any).items_json : [])
        .filter((it: any) => it?.kind === "tbs")
        .reduce((n: number, it: any) => n + Math.round((Number(it.price) || 0) * (Number(it.quantity) || 1)), 0);
      const items = goods > 0 ? goods : Math.max(0, Math.round(Number((o as any).total_idr) || 0) - delivery);
      mOrders += 1; mGoods += items; mFee += Math.round((items * feePct) / 100);
    }

    // recent TBS orders + push status (paid & pending; newest first)
    const { data: recentRows } = await supa
      .from("orders")
      .select("id, order_no, created_at, paid_at, total_idr, payment_status, meta")
      .not("meta->tbs", "is", null)
      .order("created_at", { ascending: false })
      .limit(12);
    const recent = (recentRows || []).map((o: any) => {
      const t = o?.meta?.tbs || {};
      return {
        id: o.id, order_no: o.order_no ?? null,
        when: String(o.paid_at || o.created_at || "").slice(0, 16).replace("T", " "),
        store: t.store || "?", total: Math.round(Number(o.total_idr) || 0),
        status: o.payment_status || "PENDING",
        pushed: t.pushed === true, push_state: t.pushed === true ? "pushed" : t.pushed === "claiming" ? "claiming" : "not_pushed",
        tbs_order_no: t.tbs_order_no || null, push_error: t.push_error || null,
      };
    });

    return NextResponse.json({
      ok: true,
      shop: { public: pub, preview_key: TBS_PREVIEW_KEY, fee_pct: feePct },
      backoffice_url: tbsBackofficeOrigin(),
      stores: Array.isArray(storesRes?.stores) ? storesRes.stores : Array.isArray(storesRes) ? storesRes : null,
      month: { orders: mOrders, goods_idr: mGoods, fee_idr: mFee },
      recent,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    if (b?.action !== "retry_push") return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
    const orderId = String(b?.order_id || "");
    if (!orderId) return NextResponse.json({ ok: false, error: "order_id required" }, { status: 400 });

    const supa = supaAdmin();
    const { data: order } = await supa.from("orders").select("*").eq("id", orderId).maybeSingle();
    const tbsMeta = (order as any)?.meta?.tbs;
    if (!order || !tbsMeta) return NextResponse.json({ ok: false, error: "Not a TBS order." }, { status: 400 });
    if (String(order.payment_status).toUpperCase() !== "PAID") return NextResponse.json({ ok: false, error: "Order isn't PAID yet — the push happens on payment." }, { status: 400 });
    if (tbsMeta.pushed === true) return NextResponse.json({ ok: true, already: true, tbs_order_no: tbsMeta.tbs_order_no || null });

    // same hand-off as the payment webhook; ERP event_id dedup makes it safe
    const items = Array.isArray(order.items_json) ? order.items_json : [];
    const lines = items
      .filter((it: any) => it?.kind === "tbs" && it?.sku)
      .map((it: any) => ({
        sku: String(it.sku),
        qty: Math.max(1, Math.round(Number(it.quantity) || 1)),
        price: Math.round(Number(it.price) || 0),
        amount: Math.round((Number(it.price) || 0) * (Number(it.quantity) || 1)),
      }));
    const tbsLinesSum = lines.reduce((n: number, l: any) => n + (Number(l.amount) || 0), 0);
    const tbsFee = tbsMeta.mixed ? 0 : Math.round(Number(order.shipping_cost_idr) || 0);
    const res = await pushTbsOrder({
      event_id: String(order.id),
      store: String(tbsMeta.store || ""),
      fulfil: tbsMeta.fulfil === "delivery" ? "delivery" : "pickup",
      customer: { name: String(order.customer_name || ""), phone: String(order.customer_phone || "") },
      address: tbsMeta.address || (order as any).shipping_address || null,
      notes: (order as any).notes || null,
      lines,
      subtotal: tbsLinesSum,
      delivery_fee: tbsFee,
      total: tbsLinesSum + tbsFee,
    });
    await supa
      .from("orders")
      .update({ meta: { ...(order as any).meta, tbs: { ...tbsMeta, pushed: res.ok, tbs_order_no: res.order_no || tbsMeta.tbs_order_no || null, push_error: res.ok ? null : res.error } } })
      .eq("id", order.id);
    return NextResponse.json({ ok: res.ok, tbs_order_no: res.order_no || null, error: res.ok ? null : res.error });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
