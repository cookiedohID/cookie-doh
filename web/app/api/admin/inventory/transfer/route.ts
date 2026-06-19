// web/app/api/admin/inventory/transfer/route.ts — move stock of one item from
// one location to another. Admin-only (gated by proxy.ts). Logs two
// stock_movements rows (transfer_out / transfer_in) for the reports history.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const supa = supaAdmin();
    const b = await req.json().catch(() => ({}));
    const from = String(b?.from || "").trim();
    const to = String(b?.to || "").trim();
    const itemId = String(b?.item_id || "").trim();
    const qty = Math.floor(Number(b?.qty));

    if (!from || !to || !itemId) return NextResponse.json({ ok: false, error: "Pick a source, destination and item." }, { status: 400 });
    if (from === to) return NextResponse.json({ ok: false, error: "Source and destination must be different." }, { status: 400 });
    if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ ok: false, error: "Enter a quantity greater than 0." }, { status: 400 });

    // Source must have enough tracked stock.
    const { data: src } = await supa.from("location_stock").select("stock").eq("location_id", from).eq("item_id", itemId).maybeSingle();
    if (!src || src.stock == null) return NextResponse.json({ ok: false, error: "That item isn't stock-tracked at the source location." }, { status: 400 });
    const srcBefore = Number(src.stock);
    if (srcBefore < qty) return NextResponse.json({ ok: false, error: `Source only has ${srcBefore}.` }, { status: 400 });

    const { data: dst } = await supa.from("location_stock").select("stock").eq("location_id", to).eq("item_id", itemId).maybeSingle();
    const dstBefore = dst?.stock == null ? 0 : Number(dst.stock);

    // Apply: decrement source, increment (or create) destination.
    await supa.from("location_stock").update({ stock: srcBefore - qty, updated_at: new Date().toISOString() }).eq("location_id", from).eq("item_id", itemId);
    await supa.from("location_stock").upsert(
      { location_id: to, item_id: itemId, stock: dstBefore + qty, updated_at: new Date().toISOString() },
      { onConflict: "location_id,item_id" }
    );

    // Audit log (best-effort).
    try {
      await supa.from("stock_movements").insert([
        { location_id: from, item_id: itemId, qty, stock_before: srcBefore, stock_after: srcBefore - qty, reason: "transfer_out" },
        { location_id: to, item_id: itemId, qty, stock_before: dstBefore, stock_after: dstBefore + qty, reason: "transfer_in" },
      ]);
    } catch { /* table optional */ }

    return NextResponse.json({ ok: true, from: { before: srcBefore, after: srcBefore - qty }, to: { before: dstBefore, after: dstBefore + qty } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
