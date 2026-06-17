// web/app/api/admin/customers/[id]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { phoneSignificant } from "@/lib/phone";
import { loyaltyFromOrders } from "@/lib/loyalty";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

// GET /api/admin/customers/[id] — customer profile + purchase history
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const supa = supaAdmin();

    const { data: customer, error } = await supa
      .from("customers")
      .select("id, phone, name, email, last_order_at, created_at")
      .eq("id", id)
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    if (!customer) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    // Match orders by the significant phone digits (format-agnostic).
    const sig = phoneSignificant(customer.phone);
    let orders: any[] = [];
    if (sig) {
      const { data: ord } = await supa
        .from("orders")
        .select("id, order_no, total_idr, payment_status, fulfilment_status, created_at, customer_phone, items_json")
        .ilike("customer_phone", `%${sig}%`)
        .order("created_at", { ascending: false })
        .limit(200);
      orders = ord || [];
    }

    const totalSpent = orders
      .filter((o) => String(o.payment_status).toUpperCase() === "PAID")
      .reduce((s, o) => s + (Number(o.total_idr) || 0), 0);

    // Loyalty is derived entirely from the order history (free lines = redeemed).
    const loyalty = loyaltyFromOrders(orders);

    return NextResponse.json(
      { ok: true, customer, orders, stats: { orders: orders.length, totalSpent }, loyalty },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
