// web/app/api/promo/validate/route.ts — preview a promo code for the checkout UI.
// The discount is recomputed authoritatively in the checkout route, so this is
// only for showing the customer what they'll get.
import { NextResponse } from "next/server";
import { supaAdmin } from "@/lib/supaAdmin";
import { validatePromo } from "@/lib/promo";

export const runtime = "nodejs";

// data client → Cloud SQL (pg shim) via lib/supaAdmin; .auth still Supabase (P3).

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
