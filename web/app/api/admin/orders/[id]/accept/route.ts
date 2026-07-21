// web/app/api/admin/orders/[id]/accept/route.ts
// Owner accepts a paid order -> stamps accepted_at, which stops the hourly
// "please accept" reminder. Behind the proxy.ts admin gate. Idempotent.
import { NextResponse } from "next/server";
import { supaAdmin } from "@/lib/supaAdmin";

export const runtime = "nodejs";

// data client → Cloud SQL (pg shim) via lib/supaAdmin; .auth still Supabase (P3).

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    const sb = supaAdmin();
    // Only stamp if not already accepted (keep the first acceptance time).
    const { data } = await sb
      .from("orders")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", id)
      .is("accepted_at", null)
      .select("id, accepted_at")
      .maybeSingle();
    // If nothing came back it was already accepted — still a success.
    const { data: row } = await sb.from("orders").select("accepted_at").eq("id", id).maybeSingle();
    return NextResponse.json({ ok: true, accepted_at: data?.accepted_at || row?.accepted_at || null });
  } catch (e: any) {
    console.error("[orders/accept] error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}
