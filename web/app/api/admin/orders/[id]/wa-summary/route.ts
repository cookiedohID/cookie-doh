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

function formatIDR(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function parseItems(itemsJson: any) {
  let items: any[] = [];

  try {
    if (Array.isArray(itemsJson)) items = itemsJson;
    else if (typeof itemsJson === "string") {
      const parsed = JSON.parse(itemsJson);
      if (Array.isArray(parsed)) items = parsed;
      else if (parsed && Array.isArray(parsed.items)) items = parsed.items;
    } else if (itemsJson && typeof itemsJson === "object") {
      if (Array.isArray((itemsJson as any).items)) items = (itemsJson as any).items;
    }
  } catch {
    items = [];
  }

  return items.map((it: any) => ({
    name: String(it.name ?? it.title ?? "Cookie"),
    quantity: Number(it.quantity ?? 1),
    // optional if you store it
    boxLabel: String(it.boxLabel ?? it.box ?? ""),
  }));
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!isUuid(id)) {
      return NextResponse.json({ ok: false, error: "Invalid order id" }, { status: 400 });
    }

    const sb = supabaseAdmin();

    const { data: order, error } = await sb
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!order) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });

    const items = parseItems(order.items_json);

    const orderNo = String(order.order_no ?? order.id);
    const total = typeof order.total_idr === "number" ? formatIDR(order.total_idr) : "-";

    const lines: string[] = [];
    lines.push("Cookie Doh — Order Summary");
    lines.push("");
    lines.push(`Order: ${orderNo}`);
    lines.push(`Payment: ${order.payment_status ?? "-"}`);
    lines.push(`Fulfilment: ${order.fulfilment_status ?? "-"}`);
    lines.push(`Shipment: ${order.shipment_status ?? "-"}`);
    if (order.tracking_url) lines.push(`Tracking: ${order.tracking_url}`);
    lines.push("");
    lines.push(`Customer: ${order.customer_name ?? "-"}`);
    lines.push(`Phone: ${order.customer_phone ?? "-"}`);
    lines.push("");
    lines.push("Address:");
    lines.push(String(order.shipping_address ?? "-"));
    lines.push("");
    lines.push(`Total: ${total}`);

    if (items.length) {
      lines.push("");
      lines.push("Items:");
      items.forEach((it) => {
        lines.push(`- ${it.name} ×${it.quantity}`);
      });
    }

    return NextResponse.json({
      ok: true,
      message: lines.join("\n"),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
