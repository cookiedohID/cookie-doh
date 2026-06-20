// web/app/api/promo/validate/route.ts — preview a promo code for the checkout UI.
// The discount is recomputed authoritatively in the checkout route, so this is
// only for showing the customer what they'll get.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validatePromo } from "@/lib/promo";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const supa = supaAdmin();
    const v = await validatePromo(supa, body?.code, Number(body?.subtotal || 0), body?.phone || null);
    return NextResponse.json({ ok: true, ...v });
  } catch (e: any) {
    return NextResponse.json({ ok: false, valid: false, discount: 0, reason: e?.message || "Error" }, { status: 200 });
  }
}
