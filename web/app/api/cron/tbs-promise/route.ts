// web/app/api/cron/tbs-promise/route.ts — the arrival promise (Shopee-style
// "Garansi tiba"): a paid TBS web order should be READY within N hours; if the
// store is late, the customer automatically gets a single-use voucher +
// a WhatsApp apology. Hourly via GitHub Actions.
//
// Tunables (app_settings → env → default): tbs_promise_hours (3),
// tbs_promise_voucher_idr (10000). Idempotent: meta.promise_voucher marks an
// order handled; the voucher code embeds the order id so retries can't double-issue.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cronAuthorized } from "@/lib/cron";
import { partnerGet } from "@/lib/tbsShop";
import { getSetting } from "@/lib/settings";
import { sendWhatsApp } from "@/lib/whatsapp";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

const num = async (supa: any, key: string, env: string | undefined, dflt: number) => {
  const s = Number(await getSetting(supa, key));
  if (Number.isFinite(s) && s > 0) return s;
  const e = Number(env);
  return Number.isFinite(e) && e > 0 ? e : dflt;
};

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const supa = supaAdmin();
    const hours = await num(supa, "tbs_promise_hours", process.env.TBS_PROMISE_HOURS, 3);
    const voucher = await num(supa, "tbs_promise_voucher_idr", process.env.TBS_PROMISE_VOUCHER_IDR, 10000);
    const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();

    // paid TBS orders past the promise window, not yet compensated
    const { data: rows } = await supa
      .from("orders")
      .select("id, order_no, customer_name, customer_phone, paid_at, meta")
      .eq("payment_status", "PAID")
      .not("meta->tbs", "is", null)
      .is("meta->promise_voucher", null)
      .lte("paid_at", cutoff)
      .gte("paid_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
      .limit(100);

    const candidates = (rows || []).filter((o: any) => o?.meta?.tbs?.pushed === true);
    if (!candidates.length) return NextResponse.json({ ok: true, checked: 0, issued: 0 });

    // live stage — only orders the store has NOT made ready/completed are late
    const st = await partnerGet("/order-status", { ids: candidates.map((o: any) => o.id).join(",") });
    const stageById = new Map(Array.isArray(st) ? st.map((r: any) => [String(r.event_id), String(r.status)]) : []);

    let issued = 0;
    for (const o of candidates) {
      const stage = stageById.get(String(o.id));
      if (!stage || stage === "ready" || stage === "completed" || stage === "cancelled") continue;

      const code = `SORRY-${String(o.id).slice(0, 6).toUpperCase()}`;
      const { error: insErr } = await supa.from("promo_codes").insert({
        code, type: "fixed", value: Math.round(voucher), min_subtotal: 0,
        usage_limit: 1, per_customer_limit: 1,
        expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        description: `Arrival-promise voucher for order ${o.order_no || o.id} (auto)`,
      });
      // unique(code) ⇒ a concurrent retry loses the insert and skips messaging
      if (insErr) { if (!/duplicate|unique/i.test(insErr.message || "")) console.error("promise voucher insert:", insErr.message); continue; }

      await supa.from("orders")
        .update({ meta: { ...(o.meta || {}), promise_voucher: { code, value: Math.round(voucher), at: new Date().toISOString() } } })
        .eq("id", o.id);

      try {
        await sendWhatsApp({
          to: String(o.customer_phone || ""),
          message: `Hi ${o.customer_name || ""} 🙏 Your TotalBuahStore order ${o.order_no ? "#" + o.order_no : ""} is taking longer than our ${hours}-hour promise. As an apology, here's a voucher for your next order:\n\n🎟 ${code} — Rp${Math.round(voucher).toLocaleString("id-ID")} off, valid 30 days.\n\nYour order is still being prepared and we'll update you the moment it's ready 💛`,
        });
      } catch (e) { console.error("promise voucher WA:", e); }
      issued++;
    }
    return NextResponse.json({ ok: true, checked: candidates.length, issued, hours, voucher });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
