// web/app/api/admin/promos/route.ts — list + create promo codes (admin).
// Gated by proxy.ts (admin cookie).
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { endOfDayJakarta } from "@/lib/promo";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  try {
    const supa = supaAdmin();
    const { data: codes } = await supa.from("promo_codes").select("*").order("created_at", { ascending: false });
    const { data: reds } = await supa.from("promo_redemptions").select("code, discount_idr");
    const uses: Record<string, { count: number; discount: number }> = {};
    for (const r of reds || []) {
      const c = String(r?.code || "");
      uses[c] = uses[c] || { count: 0, discount: 0 };
      uses[c].count += 1;
      uses[c].discount += Number(r?.discount_idr || 0);
    }
    const out = (codes || []).map((c: any) => ({ ...c, used: uses[c.code]?.count || 0, discountGiven: uses[c.code]?.discount || 0 }));
    return NextResponse.json({ ok: true, promos: out });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const code = String(b?.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{3,24}$/.test(code)) {
      return NextResponse.json({ ok: false, error: "Code must be 3–24 letters/numbers (no spaces)." }, { status: 400 });
    }
    const type = b?.type === "fixed" ? "fixed" : "percent";
    const value = Math.max(0, Math.floor(Number(b?.value || 0)));
    if (type === "percent" && (value < 1 || value > 100)) {
      return NextResponse.json({ ok: false, error: "Percent must be 1–100." }, { status: 400 });
    }
    if (type === "fixed" && value < 1) {
      return NextResponse.json({ ok: false, error: "Fixed amount must be at least Rp1." }, { status: 400 });
    }

    const row: any = {
      code,
      type,
      value,
      min_subtotal: Math.max(0, Math.floor(Number(b?.min_subtotal || 0))),
      max_discount: b?.max_discount ? Math.max(0, Math.floor(Number(b.max_discount))) : null,
      usage_limit: b?.usage_limit ? Math.max(1, Math.floor(Number(b.usage_limit))) : null,
      per_customer_limit: b?.per_customer_limit == null ? 1 : Math.max(0, Math.floor(Number(b.per_customer_limit))),
      expires_at: b?.expires_at ? endOfDayJakarta(b.expires_at) : null,
      active: b?.active === false ? false : true,
      description: b?.description ? String(b.description).slice(0, 200) : null,
    };

    const supa = supaAdmin();
    const { data, error } = await supa.from("promo_codes").insert(row).select("id").maybeSingle();
    if (error) {
      const dup = /duplicate|unique/i.test(error.message || "");
      return NextResponse.json({ ok: false, error: dup ? "That code already exists." : error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 400 });
  }
}
