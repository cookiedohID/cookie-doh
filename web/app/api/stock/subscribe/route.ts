// web/app/api/stock/subscribe/route.ts — "tell me when this flavour is back".
// Public. Stores one subscription per (flavour, phone); the admin's back-in-stock
// toggle notifies and clears them.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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
