//web/app/api/admin/orders/[id]/route.ts
 
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

  // accept all variants
  fulfilment_status?: string;
  shipment_status?: string;
  tracking_url?: string;
};

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid order id" }, { status: 400 });

    const body = (await req.json()) as PatchBody;

    const update: Record<string, any> = {};

    if (body.payment_status) update.payment_status = body.payment_status;

    const ff =
      body.fulfilment_status ??
      body.fulfillment_status ??
      body.fulfillment_status;

    // We try to update fulfilment_status first (what your UI uses).
    // If your DB column name differs, we fallback based on Supabase error text.
    if (ff) update.fulfilment_status = ff;

    if (typeof body.shipment_status === "string") update.shipment_status = body.shipment_status;
    if (typeof body.tracking_url === "string") update.tracking_url = body.tracking_url;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const sb = supabaseAdmin();

    // Attempt 1
    let { data, error } = await sb
      .from("orders")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();

    // Fallback if column name is different
    if (error && ff) {
      const msg = error.message || "";

      // DB uses fulfillment_status
      if (msg.includes('column "fulfilment_status"') || msg.includes("fulfilment_status")) {
        const retry = { ...update };
        delete retry.fulfilment_status;
        retry.fulfillment_status = ff;

        const r2 = await sb.from("orders").update(retry).eq("id", id).select("*").single();
        data = r2.data as any;
        error = r2.error as any;
      }

      // DB uses fulfillment_status
      if (error && (msg.includes('column "fulfillment_status"') || msg.includes("fulfillment_status"))) {
        const retry = { ...update };
        delete retry.fulfilment_status;
        retry.fulfillment_status = ff;

        const r3 = await sb.from("orders").update(retry).eq("id", id).select("*").single();
        data = r3.data as any;
        error = r3.error as any;
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
