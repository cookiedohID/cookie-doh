// web/app/api/cron/tbs-points-refund/route.ts — safety net for the atomic
// points hold (#46). A web order can HOLD (debit) TBS points at checkout but
// never get paid; the payment webhook refunds on a terminal-failed
// notification, but if that notification is ever missed, points would stay
// debited. This hourly sweep refunds held points on orders that are still
// unpaid well past the Midtrans Snap-token lifetime (~24h). Idempotent on
// source_ref = order.id:refund, so it can never double-refund.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cronAuthorized } from "@/lib/cron";
import { refundTbsPoints } from "@/lib/tbsShop";

export const runtime = "nodejs";

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
    // orders still not PAID, older than 25h, that held points and weren't refunded
    const cutoff = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    const { data: rows } = await supa
      .from("orders")
      .select("id, meta, payment_status, created_at")
      .in("payment_status", ["PENDING", "UNPAID", "FAILED"])
      .not("meta->tbs_points", "is", null)
      .lte("created_at", cutoff)
      .gte("created_at", new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString())
      .limit(500);

    let refunded = 0;
    for (const o of rows || []) {
      const tp = (o as any)?.meta?.tbs_points;
      if (!tp || tp.redeemed !== true || tp.refunded === true || !(Number(tp.discount) > 0) || !tp.phone) continue;
      const rr = await refundTbsPoints(String(tp.phone), Math.round(Number(tp.discount)), `${o.id}:refund`, "web checkout abandoned (sweep)");
      if (rr.ok) {
        await supa.from("orders").update({ meta: { ...(o as any).meta, tbs_points: { ...tp, refunded: true } } }).eq("id", o.id);
        refunded++;
      }
    }
    return NextResponse.json({ ok: true, scanned: rows?.length || 0, refunded });
  } catch (e: any) {
    console.error("tbs-points-refund error:", e);
    return NextResponse.json({ ok: false, error: "error" }, { status: 500 });
  }
}
