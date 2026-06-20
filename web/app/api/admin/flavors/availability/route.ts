// web/app/api/admin/flavors/availability/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { LOCATIONS } from "@/lib/locations";
import { FLAVORS } from "@/lib/catalog";
import { sendWhatsApp } from "@/lib/whatsapp";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Aggregate storefront sold-out for an item: true only when EVERY tracked
// location is effectively sold out (mirrors /api/flavors/availability).
async function aggSoldOut(supa: any, item_id: string): Promise<boolean> {
  const { data } = await supa.from("location_stock").select("sold_out, stock").eq("item_id", item_id);
  const rows = data || [];
  if (!rows.length) return false;
  let soldOutCount = 0;
  for (const r of rows) {
    const eff = Boolean(r.sold_out) || (typeof r.stock === "number" && r.stock <= 0);
    if (eff) soldOutCount += 1;
  }
  return soldOutCount >= rows.length;
}

// Fire when a flavour flips sold-out -> available: WhatsApp everyone subscribed,
// then clear them. Never throws (best-effort; table may not exist yet).
async function notifyBackInStock(supa: any, item_id: string) {
  try {
    const { data: subs } = await supa.from("stock_subscriptions").select("phone").eq("item_id", item_id);
    const phones = [...new Set((subs || []).map((s: any) => String(s?.phone || "")).filter(Boolean))];
    if (!phones.length) return;
    const name = FLAVORS.find((f) => f.id === item_id)?.name || "Your cookie";
    const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.cookiedoh.co.id").replace(/\/$/, "");
    const message = `🍪 Good news! ${name} is BACK IN STOCK at Cookie Doh — grab it before it sells out again: ${site}/build`;
    const BATCH = 5;
    for (let i = 0; i < phones.length; i += BATCH) {
      await Promise.all(phones.slice(i, i + BATCH).map((to: any) => sendWhatsApp({ to, message })));
    }
    await supa.from("stock_subscriptions").delete().eq("item_id", item_id);
  } catch (e) {
    console.error("back-in-stock notify failed:", e);
  }
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
