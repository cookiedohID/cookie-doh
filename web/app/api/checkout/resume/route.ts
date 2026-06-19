// web/app/api/checkout/resume/route.ts
// Lets a customer finish paying an unpaid order by reopening its saved Snap token.
// Used by the /pay/[id] page (linked from the abandoned-cart WhatsApp nudge).
//
// Access requires BOTH the order id AND the matching nudge_token (the ?t= in the
// /pay link), so knowing an order id alone is not enough to fetch the payment token.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const TERMINAL_TX = new Set(["deny", "cancel", "expire", "failure"]);

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

function firstName(name: string | null): string | null {
  const n = (name || "").trim();
  return n ? n.split(/\s+/)[0] : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("order") || "";
  const t = url.searchParams.get("t") || "";
  if (!id) return NextResponse.json({ ok: false, error: "Missing order" }, { status: 400 });
  try {
    const supabase = supaAdmin();
    const { data: o } = await supabase
      .from("orders")
      .select("id, payment_status, total_idr, customer_name, meta, nudge_token")
      .eq("id", id)
      .maybeSingle();

    // Invalid id or wrong/missing token → look identical to "not found".
    if (!o || !o.nudge_token || !t || t !== o.nudge_token) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    if (o.payment_status === "PAID") return NextResponse.json({ ok: true, paid: true });

    // Only PENDING / UNPAID with a non-terminal Midtrans status is resumable.
    const tx = String(o?.meta?.midtrans?.transaction_status || "").toLowerCase();
    const resumable = (o.payment_status === "PENDING" || o.payment_status === "UNPAID") && !TERMINAL_TX.has(tx);
    const token = o?.meta?.midtrans?.token || null;
    if (!resumable || !token) {
      return NextResponse.json(
        { ok: false, error: "This order can't be resumed online — please place a new order." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      snap_token: token,
      total_idr: o.total_idr,
      name: firstName(o.customer_name),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}
