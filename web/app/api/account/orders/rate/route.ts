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

    const { error } = await supa.from("order_ratings").upsert(
      { order_id: orderId, phone, stars, comment, updated_at: new Date().toISOString() },
      { onConflict: "order_id" }
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, stars, comment });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
