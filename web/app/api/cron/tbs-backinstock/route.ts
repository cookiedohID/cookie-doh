// web/app/api/cron/tbs-backinstock/route.ts — when an out-of-stock TBS item a
// customer asked about is back, WhatsApp them (once). Runs hourly. Reads the
// tbs_stock_interest demand table, checks live stock per store via the partner
// API, notifies open requests that carry a phone, and marks them done.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cronAuthorized } from "@/lib/cron";
import { partnerGetStock } from "@/lib/tbsShop";
import { sendWhatsApp } from "@/lib/whatsapp";

export const runtime = "nodejs";

const STORE_NAME: Record<string, string> = {
  "TBS-RCV": "RC Veteran (Bintaro)", "TBS-KTR": "Karang Tengah", "TBS-XMAS": "Bekasi",
};

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const supa = supaAdmin();
    // open requests with a phone (anonymous demand rows are kept for the report
    // but can't be pinged); newest 1000
    const { data: rows } = await supa
      .from("tbs_stock_interest")
      .select("id, sku, store, name, phone")
      .is("notified_at", null).not("phone", "is", null)
      .order("created_at", { ascending: true }).limit(1000);
    if (!rows?.length) return NextResponse.json({ ok: true, checked: 0, notified: 0 });

    // group by store, check live stock once per store
    const byStore: Record<string, any[]> = {};
    for (const r of rows) (byStore[r.store] ||= []).push(r);

    let notified = 0;
    for (const [store, list] of Object.entries(byStore)) {
      const skus = [...new Set(list.map((r) => r.sku))];
      const stock = await partnerGetStock(store, skus);
      if (!Array.isArray(stock)) continue;
      const back = new Set(
        stock.filter((x: any) => Number(x?.stock) > 0 && Number(x?.price) > 0).map((x: any) => String(x.sku))
      );
      for (const r of list) {
        if (!back.has(r.sku)) continue;
        const ok = await sendWhatsApp({
          to: String(r.phone),
          message: `🔔 Kabar baik! *${r.name || "Produk yang kamu tunggu"}* sudah tersedia lagi di TotalBuahStore ${STORE_NAME[store] || store}.\n\nBuka tokonya sebelum kehabisan lagi: https://www.cookiedoh.co.id/tbs`,
        }).catch(() => ({ ok: false }));
        if (ok.ok) {
          await supa.from("tbs_stock_interest").update({ notified_at: new Date().toISOString() }).eq("id", r.id);
          notified++;
        }
      }
    }
    return NextResponse.json({ ok: true, checked: rows.length, notified });
  } catch (e: any) {
    console.error("tbs-backinstock error:", e);
    return NextResponse.json({ ok: false, error: "error" }, { status: 500 });
  }
}
