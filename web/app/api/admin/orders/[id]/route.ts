// web/app/api/admin/orders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// --- UUID guard ---
function isUuid(id: unknown): id is string {
  return (
    typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id
    )
  );
}

const supabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(url, key, { auth: { persistSession: false } });
};

type PatchBody = {
  payment_status?: "PENDING" | "PAID";

  // keep your current spelling used in frontend:
  fulfillment_status?: "pending" | "sending" | "sent";

  shipment_status?: string;
  tracking_url?: string;
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!isUuid(id)) {
      console.error("Invalid order id:", id);
      return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
    }

    const body = (await request.json()) as PatchBody;

    // Build update object (only allow known keys)
    const update: Record<string, any> = {};

    if (body.payment_status) update.payment_status = body.payment_status;

    const ff = body.fulfillment_status ?? body.fulfillment_status;
    if (ff) {
      // IMPORTANT: pick ONE column name that matches your DB.
      // If your DB column is fulfillment_status (double L), keep this:
      update.fulfillment_status = ff;

      // If your DB column is fulfilllment_status (single L), change to:
      // update.fulfillment_status = ff;
    }

    if (typeof body.shipment_status === "string")
      update.shipment_status = body.shipment_status;

    if (typeof body.tracking_url === "string") update.tracking_url = body.tracking_url;

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
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
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
