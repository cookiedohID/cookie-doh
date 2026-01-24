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

function tryParseJson(x: any) {
  if (!x) return null;
  if (typeof x === "string") {
    try {
      return JSON.parse(x);
    } catch {
      return null;
    }
  }
  return x;
}

function extractItemsFromUnknown(order: any): { lines: string[]; source: string } {
  // 1) items_json (string or object)
  const fromItemsJson = tryParseJson(order.items_json);
  if (Array.isArray(fromItemsJson)) {
    return {
      source: "items_json[]",
      lines: fromItemsJson.map((it: any) => `- ${String(it.name ?? it.title ?? "Cookie")} ×${Number(it.quantity ?? 1)}`),
    };
  }
  if (fromItemsJson && Array.isArray(fromItemsJson.items)) {
    return {
      source: "items_json.items[]",
      lines: fromItemsJson.items.map((it: any) => `- ${String(it.name ?? it.title ?? "Cookie")} ×${Number(it.quantity ?? 1)}`),
    };
  }

  // 2) items (some schemas store an array directly)
  const fromItems = tryParseJson(order.items);
  if (Array.isArray(fromItems)) {
    return {
      source: "items[]",
      lines: fromItems.map((it: any) => `- ${String(it.name ?? it.title ?? "Cookie")} ×${Number(it.quantity ?? 1)}`),
    };
  }
  if (fromItems && Array.isArray(fromItems.items)) {
    return {
      source: "items.items[]",
      lines: fromItems.items.map((it: any) => `- ${String(it.name ?? it.title ?? "Cookie")} ×${Number(it.quantity ?? 1)}`),
    };
  }

  // 3) boxes / box summary string (your pending URL had this “boxes” block)
  const boxesText =
    String(order.boxes ?? order.boxes_text ?? order.box_summary ?? order.boxes_summary ?? "").trim();
  if (boxesText) {
    // Keep it readable in WhatsApp
    const cleaned = boxesText.replace(/\r\n/g, "\n");
    return {
      source: "boxes_text",
      lines: cleaned.split("\n").map((s) => s.trim()).filter(Boolean).map((s) => `- ${s}`),
    };
  }

  // 4) last fallback: notes sometimes include box breakdown
  const notes = String(order.notes ?? order.order_note ?? "").trim();
  if (notes) {
    return { source: "notes", lines: notes.split("\n").map((s) => s.trim()).filter(Boolean).map((s) => `- ${s}`) };
  }

  return { source: "none", lines: [] };
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

    const orderNo = String(order.order_no ?? order.id);
    const total = typeof order.total_idr === "number" ? formatIDR(order.total_idr) : "-";

    const { lines: itemLines, source } = extractItemsFromUnknown(order);

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

    lines.push("");
    lines.push("Items:");
    if (itemLines.length) {
      itemLines.forEach((l) => lines.push(l));
    } else {
      lines.push("- (Item breakdown not found in database yet)");
    }

    // Debug hint (won’t show to customer, only admin WhatsApp)
    lines.push("");
    lines.push(`(debug: items source = ${source})`);

    return NextResponse.json({
      ok: true,
      message: lines.join("\n"),
      debug: {
        source,
        keys: Object.keys(order),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
