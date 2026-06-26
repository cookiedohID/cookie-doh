// web/app/api/loyalty/lookup/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canonicalPhone, phoneSignificant } from "@/lib/phone";
import { loyaltyFromOrders } from "@/lib/loyalty";
import { grantsForPhone } from "@/lib/loyaltyGrants";
import { subscriptionRewardBalance } from "@/lib/subscriptionRewards";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Compute a phone's available rewards from paid order history. Used by the POS.
// `stampsPerFree` lets a VIP member earn faster (buy-9/8/7-get-1); omit for the
// standard buy-10.
export async function loyaltyForPhone(supa: any, phone: string, stampsPerFree?: number) {
  const sig = phoneSignificant(phone);
  if (!sig) return null;
  const { data } = await supa
    .from("orders")
    .select("payment_status, items_json, customer_phone")
    .ilike("customer_phone", `%${sig}%`)
    .limit(1000);
  // ilike is only a loose prefilter (orders store the phone as typed, in mixed
  // formats). Require an EXACT canonical match so a shorter significant-number
  // string can't match inside a different, longer number.
  const exact = (data || []).filter((o: any) => phoneSignificant(o?.customer_phone) === sig);
  const grant = await grantsForPhone(supa, phone);
  return loyaltyFromOrders(exact, grant, stampsPerFree);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = String(body?.code || "").trim();
    let phone = canonicalPhone(body?.phone);

    const supa = supaAdmin();

    // Resolve a scanned membership code (e.g. "CD32181818") to the member's phone.
    let name: string | null = null;
    if (!phone && code) {
      const { data: c } = await supa.from("customers").select("phone, name").eq("member_code", code).maybeSingle();
      if (c?.phone) { phone = c.phone; name = c.name || null; }
    }

    if (!phone) return NextResponse.json({ ok: false, error: "Enter a valid phone or scan a member QR." }, { status: 400 });

    if (name === null) {
      const { data: cust } = await supa.from("customers").select("name").eq("phone", phone).maybeSingle();
      name = cust?.name || null;
    }

    const loyalty = await loyaltyForPhone(supa, phone);
    if (!loyalty) return NextResponse.json({ ok: false, error: "No history" }, { status: 200 });

    // Separate, redeemable subscription reward pool ("buy 6, get 1 free").
    const subReward = await subscriptionRewardBalance(supa, phone);

    return NextResponse.json({
      ok: true,
      phone, // returned so the POS can use it for redemption + checkout after a scan
      name,
      freeCookies: loyalty.freeCookies,
      freeDrinks: loyalty.freeDrinks,
      cookieStamps: loyalty.cookieStamps,
      drinkStamps: loyalty.drinkStamps,
      subRewardAvailable: subReward.available,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
