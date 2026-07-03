// web/app/api/admin/flavors/availability/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { LOCATIONS } from "@/lib/locations";
import { aggSoldOut, notifyBackInStock } from "@/lib/stockAlerts";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

function checkAdminAuth(req: Request) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return true;
  return (req.headers.get("x-admin-token") || "") === token;
}

const VALID_LOC = new Set(LOCATIONS.map((l) => l.id));

export async function POST(req: Request) {
  try {
    if (!checkAdminAuth(req)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const location_id = String(body?.location_id || "").trim();
    const item_id = String(body?.flavor_id || body?.item_id || "").trim();

    if (!location_id || !VALID_LOC.has(location_id)) {
      return NextResponse.json({ ok: false, error: "Invalid location_id" }, { status: 400 });
    }
    if (!item_id) {
      return NextResponse.json({ ok: false, error: "Missing item_id" }, { status: 400 });
    }

    const patch: Record<string, any> = {
      location_id,
      item_id,
      updated_at: new Date().toISOString(),
    };
    if ("sold_out" in body) patch.sold_out = Boolean(body.sold_out);
    if ("stock" in body) {
      const raw = body.stock;
      patch.stock =
        raw === null || raw === ""
          ? null
          : Math.max(0, Math.floor(Number(raw) || 0));
    }

    const supa = supaAdmin();

    // Detect a sold-out -> available flip across the whole storefront so we can
    // alert subscribers (only the change matters; check before + after the write).
    const wasSoldOut = await aggSoldOut(supa, item_id);

    const { error } = await supa
      .from("location_stock")
      .upsert(patch, { onConflict: "location_id,item_id" });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (wasSoldOut) {
      const nowSoldOut = await aggSoldOut(supa, item_id);
      if (!nowSoldOut) await notifyBackInStock(supa, item_id);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
