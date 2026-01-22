// app/api/admin/orders/[id]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// --- UUID guard ---
function isUuid(id: unknown): id is string {
  return (
    typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  );
}

// --- Param extractor (handles folder name mismatch) ---
// If folder is [id] -> params.id
// If folder is [orderId] -> params.orderId
// If folder is [order_id] -> params.order_id
function getParamId(params: Record<string, string | string[] | undefined>) {
  const firstKey = Object.keys(params)[0];
  const raw = (firstKey ? params[firstKey] : undefined) ?? params["id"];

  if (Array.isArray(raw)) return raw[0];
  return raw;
}

const supabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
};

type PatchBody = {
  payment_status?: "PENDING" | "PAID";
  fullfillment_status?: "pending" | "sending" | "sent";
  // if you later standardize spelling:
  fulfillment_status?: "pending" | "sending" | "sent";
  shipment_status?: string;
  tracking_url?: string;
};

export async function PATCH(
  req: Request,
  ctx: { params: Record<string, string | string[] | undefined> }
) {
  try {
    const id = getParamId(ctx.params);

    // 🔥 This is the line that was causing your "undefined" before:
    // if you used params.id but folder was [orderId], it becomes undefined.
    if (!isUuid(id)) {
      console.error("Invalid order id:", id, "params=", ctx.params);
      return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
    }

    const body = (await req.json()) as PatchBody;

    // Allow only known fields
    const update: Record<string, any> = {};

    if (body.payment_status) update.payment_status = body.payment_status;

    // Support BOTH spellings safely:
    const ff =
      body.fullfillment_status ??
      body.fulfillment_status;

    if (ff) {
      // IMPORTANT:
      // If your DB column is actually "fulfillment_status" (single L),
      // change the key below to match your DB.
      //
      // For now, this keeps your current spelling:
      update.fullfillment_status = ff;
    }

    if (typeof body.shipment_status === "string") update.shipment_status = body.shipment_status;
    if (typeof body.tracking_url === "string") update.tracking_url = body.tracking_url;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("orders")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("Supabase update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, order: data });
  } catch (e: any) {
    console.error("PATCH /api/admin/orders/[id] error:", e);
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
