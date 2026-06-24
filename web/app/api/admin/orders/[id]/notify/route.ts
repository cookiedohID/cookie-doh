// web/app/api/admin/orders/[id]/notify/route.ts
// Send a WhatsApp to the CUSTOMER for this order. Behind the proxy.ts admin gate.
//   POST { kind: "confirm" }      -> re-send the order-details confirmation
//   POST { kind: "on_the_way" }   -> "on its way" + tracking link; also marks the
//                                    order accepted + fulfilment 'sent'
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyCustomerOrderConfirmed, notifyCustomerOnTheWay } from "@/lib/orderComms";

export const runtime = "nodejs";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const kind = String(body?.kind || "");

    const sb = supabaseAdmin();
    const { data: order } = await sb.from("orders").select("*").eq("id", id).maybeSingle();
    if (!order) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });

    if (kind === "confirm") {
      if (!order.customer_phone) return NextResponse.json({ ok: false, error: "This order has no customer phone." }, { status: 400 });
      await notifyCustomerOrderConfirmed(order);
      return NextResponse.json({ ok: true, sent: "confirm" });
    }

    if (kind === "on_the_way") {
      // The owner can paste/confirm the tracking link right here — we save it AND
      // send it in this one action (no separate "save status" step).
      const trackingUrl = String(body?.tracking_url || "").trim();
      if (trackingUrl) order.tracking_url = trackingUrl; // use it in the message
      const r = await notifyCustomerOnTheWay(order);
      if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
      // Sending "on its way" implies the owner has accepted + dispatched.
      await sb
        .from("orders")
        .update({
          accepted_at: order.accepted_at || new Date().toISOString(),
          fulfilment_status: order.fulfilment_status === "completed" ? "completed" : "sent",
          ...(trackingUrl ? { tracking_url: trackingUrl } : {}),
        })
        .eq("id", id);
      return NextResponse.json({ ok: true, sent: "on_the_way" });
    }

    return NextResponse.json({ ok: false, error: "Unknown kind" }, { status: 400 });
  } catch (e: any) {
    console.error("[orders/notify] error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}
