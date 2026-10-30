// web/app/api/admin/customers/route.ts
import { NextResponse } from "next/server";
import { supaAdmin } from "@/lib/supaAdmin";

export const runtime = "nodejs";

// data client → Cloud SQL (pg shim) via lib/supaAdmin; .auth still Supabase (P3).

// GET /api/admin/customers?q=name  — search by name (or recent if empty)
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams.get("q")?.trim() || "";
    const supa = supaAdmin();

    let query = supa
      .from("customers")
      .select("id, phone, name, email, last_order_at, created_at")
      .order("last_order_at", { ascending: false, nullsFirst: false })
      .limit(50);

    if (q) query = query.ilike("name", `%${q}%`);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message, customers: [] }, { status: 200 });
    }
    return NextResponse.json({ ok: true, customers: data || [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error", customers: [] }, { status: 200 });
  }
}
