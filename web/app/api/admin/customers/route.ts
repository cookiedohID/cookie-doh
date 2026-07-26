// web/app/api/admin/customers/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

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
