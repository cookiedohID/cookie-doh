import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);
    const payment = searchParams.get("payment_status");
    const fulfillment = searchParams.get("fulfillment_status");
    const q = (searchParams.get("q") || "").trim();

    const supabase = supaAdmin();

    let query = supabase
      .from("orders")
      .select(
        "id, created_at, customer_name, customer_phone, total, payment_status, fulfillment_status, delivery_method, address, building_name, postal_code, tracking_url",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (payment) query = query.eq("payment_status", payment);
    if (fulfillment) query = query.eq("fulfillment_status", fulfillment);

    if (q) {
      // best-effort search across a few common fields
      query = query.or(
        [
          `customer_name.ilike.%${q}%`,
          `customer_phone.ilike.%${q}%`,
          `address.ilike.%${q}%`,
          `id.eq.${q}`,
        ].join(",")
      );
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true, count: count ?? null, orders: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to load orders" }, { status: 500 });
  }
}
