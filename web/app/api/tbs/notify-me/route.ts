// web/app/api/tbs/notify-me/route.ts — "notify me when it's back" on an
// out-of-stock TBS item. Doubles as a DEMAND SIGNAL: every tap records interest
// in a SKU at a store (owner: learn which SKUs are high customer interest).
// If the visitor is a logged-in member we capture their phone so the
// back-in-stock cron can WhatsApp them; anonymous taps still count as demand.
// Gated by the shop flag/preview like the other /api/tbs proxies.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canSeeTbsShop } from "@/lib/tbsShop";
import { canonicalPhone } from "@/lib/phone";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    if (!(await canSeeTbsShop(req))) return NextResponse.json({ ok: false }, { status: 404 });
    const supa = supaAdmin();
    const b = await req.json().catch(() => ({}));
    const sku = String(b?.sku || "").trim().slice(0, 48);
    const store = String(b?.store || "").trim().toUpperCase();
    const name = String(b?.name || "").trim().slice(0, 160) || null;
    if (!/^[A-Za-z0-9@_-]{2,48}$/.test(sku) || !/^[A-Z0-9-]{2,20}$/.test(store)) {
      return NextResponse.json({ ok: false, error: "bad params" }, { status: 400 });
    }

    // logged-in member? capture their phone for the back-in-stock ping
    let phone: string | null = null;
    const h = req.headers.get("authorization") || "";
    const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
    if (token) {
      try {
        const { data: u } = await supa.auth.getUser(token);
        if (u?.user?.id) {
          const { data: c } = await supa.from("customers").select("phone").eq("auth_user_id", u.user.id).eq("phone_verified", true).limit(1);
          if (c?.[0]?.phone) phone = canonicalPhone(String(c[0].phone));
        }
      } catch { /* anonymous demand still counts */ }
    }

    // de-dupe an open request per (sku, store, phone) so one member = one ping,
    // but every distinct visitor still adds to the demand count
    if (phone) {
      const { data: dup } = await supa
        .from("tbs_stock_interest").select("id")
        .eq("sku", sku).eq("store", store).eq("phone", phone).is("notified_at", null).limit(1);
      if (dup?.length) return NextResponse.json({ ok: true, already: true });
    }
    await supa.from("tbs_stock_interest").insert({ sku, store, name, phone });
    return NextResponse.json({ ok: true, willNotify: Boolean(phone) });
  } catch (e: any) {
    console.error("notify-me error:", e);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
