// web/app/api/admin/orders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function isUuid(id: unknown): id is string {
  return (
    typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  );
}

const supabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
};

type PatchBody = {
  payment_status?: "PENDING" | "PAID" | string;

  // accept all variants (UK, US, common typo)
  fulfilment_status?: string;
  fulfillment_status?: string;
  fullfillment_status?: string;

  shipment_status?: string;
  tracking_url?: string;
  waybill?: string; // (optional, since your client sends it)
};

/**
 * ✅ GET order detail
 * Supports:
 * - /api/admin/orders/<uuid>
 * - /api/admin/orders/<order_no like CD-20260130-0058>
 */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const sb = supabaseAdmin();

    // If UUID -> query by id, else treat as order_no
    const q = sb.from("orders").select("*").limit(1);

    const { data: order, error } = isUuid(id)
      ? await q.eq("id", id).single()
      : await q.eq("order_no", id).single();

    if (error) {
      return NextResponse.json({ error: error.message, detail: error }, { status: 500 });
    }
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Items can live in items_json (array) or other columns.
    // We keep it simple: return items_json if it looks like array.
    let items: any[] = [];
    const itemsJson = (order as any).items_json;
    if (Array.isArray(itemsJson)) items = itemsJson;
    else {
      // if stored as string JSON
      if (typeof itemsJson === "string") {
        try {
          const parsed = JSON.parse(itemsJson);
          if (Array.isArray(parsed)) items = parsed;
          else if (parsed && Array.isArray(parsed.items)) items = parsed.items;
        } catch {
          // ignore
        }
      }
    }

    return NextResponse.json({ ok: true, order, items });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load order", detail: e ?? null },
      { status: 500 }
    );
  }
}

/**
 * ✅ PATCH order (UUID only)
 * This keeps updates safe + predictable.
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid order id" }, { status: 400 });

    const body = (await req.json()) as PatchBody;

    const update: Record<string, any> = {};

    if (body.payment_status) update.payment_status = body.payment_status;

    const ff = body.fulfilment_status ?? body.fulfillment_status ?? body.fullfillment_status;

    // ✅ Canonical: try UK column first because your UI uses it
    if (ff) update.fulfilment_status = ff;

    if (typeof body.shipment_status === "string") update.shipment_status = body.shipment_status;
    if (typeof body.tracking_url === "string") update.tracking_url = body.tracking_url;
    if (typeof body.waybill === "string") update.waybill = body.waybill;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const sb = supabaseAdmin();

    // Attempt 1: update using fulfilment_status
    let { data, error } = await sb
      .from("orders")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();

    // Fallback: DB might use fulfillment_status (US spelling)
    if (error && ff) {
      const msg = error.message || "";

      if (msg.includes("fulfilment_status")) {
        const retry = { ...update };
        delete retry.fulfilment_status;

        // ✅ IMPORTANT: fallback should update fulfillment_status (US),
        // not fulfilment_status again.
        retry.fulfillment_status = ff;

        const r2 = await sb.from("orders").update(retry).eq("id", id).select("*").single();
        data = r2.data as any;
        error = r2.error as any;
      }
    }

    if (error) {
      return NextResponse.json({ error: error.message, detail: error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, order: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Update failed", detail: e ?? null },
      { status: 500 }
    );
  }
}
