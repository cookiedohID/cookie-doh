// web/app/api/admin/orders/[id]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Ctx) {
  try {
    const { id: orderId } = await context.params;

    const supabase = supaAdmin();

    const { data: order, error: e1 } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();

    if (e1) throw e1;
    if (!order) {
      return NextResponse.json(
        { ok: false, error: "Order not found" },
        { status: 404 }
      );
    }

    const { data: items, error: e2 } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });

    if (e2) throw e2;

    return NextResponse.json({ ok: true, order, items: items ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to load order" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, context: Ctx) {
  try {
    const { id: orderId } = await context.params;

    const supabase = supaAdmin();
    const body = await req.json().catch(() => ({}));

    // allowed fields for ops
    const patch: Record<string, any> = {};

    if (typeof body.payment_status === "string")
      patch.payment_status = body.payment_status;

    if (typeof body.fulfillment_status === "string")
      patch.fulfillment_status = body.fulfillment_status;

    if (typeof body.tracking_url === "string")
      patch.tracking_url = body.tracking_url;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("orders")
      .update(patch)
      .eq("id", orderId)
      .select("*")
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ ok: true, order: data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to update order" },
      { status: 500 }
    );
  }
}
