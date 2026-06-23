// web/app/api/admin/subscriptions/route.ts
// Admin view of subscriptions + actions. Behind the proxy.ts admin gate (cd_admin),
// so no inline auth — same as the other /api/admin/* routes.
//
//   GET  -> { subscriptions:[...], dueSoon:[...], needsAttention:[...] }
//   POST { action:"refund_paid", subscription_id }     -> mark a refund settled
//   POST { action:"run_cron" }                         -> trigger today's autopilot
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runSubscriptionCron } from "@/lib/subscriptionMaterialize";
import { addDays, todayIso } from "@/lib/subscriptions";

export const runtime = "nodejs";
export const maxDuration = 120;

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  try {
    const sb = supabaseAdmin();

    const { data: subs } = await sb
      .from("subscriptions")
      .select("*")
      .neq("status", "pending_payment")
      .order("created_at", { ascending: false })
      .limit(500);

    const ids = (subs || []).map((s: any) => s.id);
    const plansBySub: Record<string, any[]> = {};
    if (ids.length) {
      const { data: plans } = await sb
        .from("subscription_plans")
        .select("subscription_id, boxes_total, boxes_used, amount_idr, payment_status, paid_at")
        .in("subscription_id", ids);
      for (const p of plans || []) (plansBySub[p.subscription_id] ||= []).push(p);
    }

    const enriched = (subs || []).map((s: any) => {
      const plans = plansBySub[s.id] || [];
      const paid = plans.filter((p) => p.payment_status === "PAID");
      const remaining = paid.reduce((n, p) => n + Math.max(0, Number(p.boxes_total) - Number(p.boxes_used)), 0);
      const prepaidValue = paid.reduce((n, p) => n + Number(p.amount_idr || 0), 0);
      return { ...s, remaining, prepaidValue, planCount: paid.length };
    });

    // Boxes due in the next 3 days (operational worklist) + made-but-no-order orphans.
    const horizon = addDays(todayIso(), 3);
    const { data: dueSoon } = await sb
      .from("subscription_deliveries")
      .select("id, subscription_id, seq, scheduled_for, status, order_no")
      .eq("status", "scheduled")
      .lte("scheduled_for", horizon)
      .order("scheduled_for", { ascending: true })
      .limit(200);

    const { data: needsAttention } = await sb
      .from("subscription_deliveries")
      .select("id, subscription_id, seq, scheduled_for, status, made_at")
      .eq("status", "made")
      .is("order_id", null)
      .limit(100);

    return NextResponse.json({
      ok: true,
      subscriptions: enriched,
      dueSoon: dueSoon || [],
      needsAttention: needsAttention || [],
    });
  } catch (e: any) {
    console.error("[admin/subscriptions] GET error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "refund_paid") {
      const id = String(body?.subscription_id || "").trim();
      if (!id) return NextResponse.json({ ok: false, error: "Missing subscription_id" }, { status: 400 });
      await sb.from("subscriptions").update({ refund_status: "paid", updated_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ ok: true });
    }

    if (action === "run_cron") {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.cookiedoh.co.id";
      const result = await runSubscriptionCron(sb, { siteUrl, dry: false });
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    console.error("[admin/subscriptions] POST error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 400 });
  }
}
