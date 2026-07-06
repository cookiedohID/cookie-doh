// web/app/api/account/orders/rate/route.ts — rate a completed order (Shopee
// 'Nilai'). Auth: bearer → verified phone; the order must belong to that phone.
// Upsert (customers may edit their rating). 1–5 stars + optional comment.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canonicalPhone, phoneSignificant } from "@/lib/phone";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const supa = supaAdmin();
    const h = req.headers.get("authorization") || "";
    const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
    if (!token) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
    const { data: u } = await supa.auth.getUser(token);
    if (!u?.user?.id) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
    const { data: custRows } = await supa
      .from("customers").select("phone")
      .eq("auth_user_id", u.user.id).eq("phone_verified", true).limit(1);
    const phone = custRows?.[0]?.phone ? canonicalPhone(String(custRows[0].phone)) : null;
    if (!phone) return NextResponse.json({ ok: false, error: "Verify your WhatsApp number first." }, { status: 401 });

    const b = await req.json().catch(() => ({}));
    const orderId = String(b?.order_id || "");
    const stars = Math.round(Number(b?.stars));
    const comment = String(b?.comment || "").trim().slice(0, 500) || null;
    if (!orderId || !Number.isFinite(stars) || stars < 1 || stars > 5) {
      return NextResponse.json({ ok: false, error: "Pick 1–5 stars." }, { status: 400 });
    }

    const { data: order } = await supa
      .from("orders").select("id, customer_phone, payment_status").eq("id", orderId).maybeSingle();
    if (!order || phoneSignificant(String(order.customer_phone || "")) !== phoneSignificant(phone)) {
      return NextResponse.json({ ok: false, error: "That order isn't on your account." }, { status: 403 });
    }
    if (String(order.payment_status).toUpperCase() !== "PAID") {
      return NextResponse.json({ ok: false, error: "You can rate an order once it's paid." }, { status: 400 });
    }

    const { data: existing } = await supa.from("order_ratings").select("order_id, points_granted").eq("order_id", orderId).maybeSingle();
    const { error } = await supa.from("order_ratings").upsert(
      { order_id: orderId, phone, stars, comment, updated_at: new Date().toISOString() },
      { onConflict: "order_id" }
    );
    if (error) throw new Error(error.message);

    // Rate-to-earn (Shopee 'dapatkan koin'): grant points ONCE per order, but
    // RETRYABLE — gated on points_granted (not merely "first rating"), so a
    // failed grant (ERP briefly down) is re-attempted on the next rating/edit
    // instead of being lost forever. Idempotent at the ledger too
    // (source_ref = rating:<order_id>).
    let earned = 0;
    if (!existing?.points_granted) {
      try {
        const { getSetting } = await import("@/lib/settings");
        const n = Number(await getSetting(supa, "tbs_rating_reward_points"));
        const reward = Number.isFinite(n) && n >= 0 ? Math.round(n) : 100;
        if (reward > 0) {
          const { partnerPost } = await import("@/lib/tbsShop");
          const r = await partnerPost("/adjust", { phone, points: reward, source_ref: `rating:${orderId}`, reason: `Rate-to-earn — order ${orderId.slice(0, 8)}` });
          if (r?.ok) {
            earned = reward;
            await supa.from("order_ratings").update({ points_granted: true }).eq("order_id", orderId);
          }
        } else {
          await supa.from("order_ratings").update({ points_granted: true }).eq("order_id", orderId); // reward off = nothing to retry
        }
      } catch { /* points are a bonus, never block the rating; retried next time */ }
    }
    return NextResponse.json({ ok: true, stars, comment, earned });
  } catch (e: any) {
    console.error("route error:", e); return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
