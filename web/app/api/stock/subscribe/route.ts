// web/app/api/stock/subscribe/route.ts — "tell me when this flavour is back".
// Public. Stores one subscription per (flavour, phone); the admin's back-in-stock
// toggle notifies and clears them.
import { NextResponse } from "next/server";
import { supaAdmin } from "@/lib/supaAdmin";
import { canonicalPhone } from "@/lib/phone";

export const runtime = "nodejs";

// data client → Cloud SQL (pg shim) via lib/supaAdmin; .auth still Supabase (P3).

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const item_id = String(b?.flavor_id || b?.item_id || "").trim();
    const phone = canonicalPhone(b?.phone);
    if (!item_id) return NextResponse.json({ ok: false, error: "Missing flavour" }, { status: 400 });
    if (!phone) return NextResponse.json({ ok: false, error: "Enter a valid phone number" }, { status: 400 });

    const supa = supaAdmin();
    const { error } = await supa.from("stock_subscriptions").upsert({ item_id, phone }, { onConflict: "item_id,phone" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 400 });
  }
}
