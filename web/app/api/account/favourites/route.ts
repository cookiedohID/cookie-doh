// web/app/api/account/favourites/route.ts
// The signed-in member's most-ordered cookies (for quick-filling a subscription
// box). AUTH REQUIRED; reads only THIS member's paid orders (matched by their
// OTP-verified phone, same significant-digit match as loyalty). Free/bonus lines
// and discontinued flavours are ignored.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMember } from "@/lib/memberServer";
import { phoneSignificant } from "@/lib/phone";
import { classifyItem } from "@/lib/loyalty";
import { FLAVORS } from "@/lib/catalog";

export const runtime = "nodejs";

const CURRENT_COOKIES = new Map(FLAVORS.filter((f: any) => !f.soldOut).map((f: any) => [String(f.id), f.name]));

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    const supa = supaAdmin();
    const member = await getMember(supa, req);
    if (!member) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    if (!member.ownerPhone) return NextResponse.json({ ok: true, favourites: [] });

    const sig = phoneSignificant(member.ownerPhone);
    if (!sig) return NextResponse.json({ ok: true, favourites: [] });

    // Loose prefilter on the phone, then require an exact significant-digit match
    // (orders store the phone as typed, in mixed formats).
    const { data } = await supa
      .from("orders")
      .select("payment_status, items_json, customer_phone, created_at")
      .ilike("customer_phone", `%${sig}%`)
      .eq("payment_status", "PAID")
      .order("created_at", { ascending: false })
      .limit(300);

    const mine = (data || []).filter((o: any) => phoneSignificant(o?.customer_phone) === sig);

    const tally: Record<string, number> = {};
    for (const o of mine) {
      const items = Array.isArray(o?.items_json) ? o.items_json : [];
      for (const it of items) {
        if (it?.free === true || it?.bonus === true) continue; // ignore freebies/bonuses
        const id = String(it?.id ?? "");
        if (!CURRENT_COOKIES.has(id)) continue; // only current, in-catalog cookies
        if (classifyItem(id, it?.kind) !== "cookie") continue;
        const qty = Math.max(0, Math.floor(Number(it?.quantity ?? 0)));
        if (!qty) continue;
        tally[id] = (tally[id] || 0) + qty;
      }
    }

    const favourites = Object.entries(tally)
      .map(([id, count]) => ({ id, name: CURRENT_COOKIES.get(id) || id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return NextResponse.json({ ok: true, favourites });
  } catch (e: any) {
    console.error("[account/favourites] error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}
