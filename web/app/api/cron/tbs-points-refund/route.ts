// web/app/api/cron/tbs-points-refund/route.ts — safety net for the atomic
// points hold (#46). A web order can HOLD (debit) TBS points at checkout but
// never get paid; the payment webhook refunds on a terminal Midtrans
// notification, but if that notification is ever missed, points would stay
// debited. This hourly sweep refunds held points — BUT only after confirming
// with Midtrans that the transaction is genuinely terminal (expire/cancel/
// deny/failure). It must NOT refund a still-payable order (a bank-transfer/VA
// can legitimately settle > 24h after checkout); refunding one and then having
// it settle would give the customer the discount AND their points back.
// Idempotent on source_ref = order.id:refund.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import midtransClient from "midtrans-client";
import { cronAuthorized } from "@/lib/cron";
import { refundTbsPoints } from "@/lib/tbsShop";

export const runtime = "nodejs";

const TERMINAL = new Set(["expire", "cancel", "deny", "failure"]);

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const supa = supaAdmin();
    const core = process.env.MIDTRANS_SERVER_KEY
      ? new midtransClient.CoreApi({ isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true", serverKey: process.env.MIDTRANS_SERVER_KEY })
      : null;
    if (!core) return NextResponse.json({ ok: false, error: "no midtrans key" }, { status: 200 });

    // candidates: not yet paid, older than 25h, held real points, not refunded/uncertain
    const cutoff = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    const { data: rows } = await supa
      .from("orders")
      .select("id, midtrans_order_id, meta, payment_status, created_at")
      .in("payment_status", ["PENDING", "UNPAID", "FAILED"])
      .not("meta->tbs_points", "is", null)
      .lte("created_at", cutoff)
      .gte("created_at", new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString())
      .limit(300);

    let refunded = 0, checked = 0, stillLive = 0;
    for (const o of rows || []) {
      const tp = (o as any)?.meta?.tbs_points;
      if (!tp || tp.redeemed !== true || tp.refunded === true || !(Number(tp.discount) > 0) || !tp.phone) continue;
      if (!o.midtrans_order_id) continue;
      checked++;
      // AUTHORITATIVE: only refund if Midtrans confirms the tx is dead.
      let txStatus = "";
      try { const st: any = await core.transaction.status(o.midtrans_order_id); txStatus = String(st?.transaction_status || ""); }
      catch (e: any) {
        // 404 = transaction never created / long gone → treat as terminal
        if (/404|not.*found/i.test(String(e?.message || e?.httpStatusCode || ""))) txStatus = "expire";
        else { continue; } // transient error — retry next sweep, never refund on doubt
      }
      if (!TERMINAL.has(txStatus)) { stillLive++; continue; } // could still be paid — hands off
      const rr = await refundTbsPoints(String(tp.phone), Math.round(Number(tp.discount)), `${o.id}:refund`, "web checkout expired (sweep)");
      if (rr.ok) {
        await supa.from("orders").update({ meta: { ...(o as any).meta, tbs_points: { ...tp, refunded: true } } }).eq("id", o.id);
        refunded++;
      }
    }
    return NextResponse.json({ ok: true, scanned: rows?.length || 0, checked, stillLive, refunded });
  } catch (e: any) {
    console.error("tbs-points-refund error:", e);
    return NextResponse.json({ ok: false, error: "error" }, { status: 500 });
  }
}
