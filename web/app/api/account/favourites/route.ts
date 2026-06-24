// web/app/api/account/favourites/route.ts
// The signed-in member's "usuals" derived from their PAID order history: most-
// ordered cookies + drinks, their go-to bundle, and their usual box size. AUTH
// REQUIRED; matched by the member's OTP-verified phone (same significant-digit
// match as loyalty). Free/bonus lines and discontinued items are ignored.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMember } from "@/lib/memberServer";
import { phoneSignificant } from "@/lib/phone";
import { classifyItem } from "@/lib/loyalty";
import { FLAVORS } from "@/lib/catalog";
import { SMOOTHIES } from "@/lib/smoothies";
import { BUNDLES } from "@/lib/bundles";

export const runtime = "nodejs";

const COOKIE_NAME = new Map(FLAVORS.filter((f: any) => !f.soldOut).map((f: any) => [String(f.id), f.name]));
const DRINK = new Map(SMOOTHIES.filter((s: any) => !s.soldOut).map((s: any) => [String(s.id), { name: s.name, image: s.image }]));
const COOKIE_IMG = new Map(FLAVORS.map((f: any) => [String(f.id), f.image]));
// Match a bundle by its (cookies, drinks) shape, e.g. "3x2" -> Sweet Sharer.
const BUNDLE_BY_SHAPE = new Map(BUNDLES.map((b) => [`${b.cookies}x${b.drinks}`, b]));

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

function topN(tally: Record<string, number>, label: (id: string) => string, extra?: (id: string) => any, n = 8) {
  return Object.entries(tally)
    .map(([id, count]) => ({ id, name: label(id), count, ...(extra ? extra(id) : {}) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

export async function GET(req: Request) {
  try {
    const supa = supaAdmin();
    const member = await getMember(supa, req);
    if (!member) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    if (!member.ownerPhone) return NextResponse.json({ ok: true, favourites: [], cookies: [], drinks: [], bundles: [], boxSize: null });

    const sig = phoneSignificant(member.ownerPhone);
    if (!sig) return NextResponse.json({ ok: true, favourites: [], cookies: [], drinks: [], bundles: [], boxSize: null });

    const { data } = await supa
      .from("orders")
      .select("payment_status, items_json, customer_phone, meta, created_at")
      .ilike("customer_phone", `%${sig}%`)
      .eq("payment_status", "PAID")
      .order("created_at", { ascending: false })
      .limit(300);

    const mine = (data || []).filter((o: any) => phoneSignificant(o?.customer_phone) === sig);

    const cookieTally: Record<string, number> = {};
    const drinkTally: Record<string, number> = {};
    const bundleTally: Record<string, number> = {};
    const boxSizeTally: Record<string, number> = {};

    for (const o of mine) {
      const items = Array.isArray(o?.items_json) ? o.items_json : [];

      // Per-order bundle shape: total bundle cookies vs drinks → match a bundle.
      let bCookies = 0, bDrinks = 0;
      for (const it of items) {
        const id = String(it?.id ?? "");
        const qty = Math.max(0, Math.floor(Number(it?.quantity ?? 0)));
        if (!qty) continue;
        const kind = classifyItem(id, it?.kind);
        if (it?.bundle === true) {
          if (kind === "cookie") bCookies += qty;
          else if (kind === "drink") bDrinks += qty;
          continue; // bundle lines feed bundle detection, not item favourites
        }
        if (it?.free === true) continue; // ignore freebies/bonuses
        if (kind === "cookie" && COOKIE_NAME.has(id)) cookieTally[id] = (cookieTally[id] || 0) + qty;
        else if (kind === "drink" && DRINK.has(id)) drinkTally[id] = (drinkTally[id] || 0) + qty;
      }
      if (bCookies || bDrinks) {
        const b = BUNDLE_BY_SHAPE.get(`${bCookies}x${bDrinks}`);
        if (b) bundleTally[b.id] = (bundleTally[b.id] || 0) + 1;
      }

      // Usual box size from the human-readable summary ("Box of 3/6").
      const txt = String(o?.meta?.boxes_text || "");
      const m = txt.match(/Box of (\d+)/g);
      if (m) for (const hit of m) {
        const n = hit.replace(/\D/g, "");
        if (n === "3" || n === "6") boxSizeTally[n] = (boxSizeTally[n] || 0) + 1;
      }
    }

    const cookies = topN(cookieTally, (id) => COOKIE_NAME.get(id) || id, (id) => ({ image: COOKIE_IMG.get(id) || null }));
    const drinks = topN(drinkTally, (id) => DRINK.get(id)?.name || id, (id) => ({ image: DRINK.get(id)?.image || null }));
    const bundles = topN(bundleTally, (id) => BUNDLES.find((b) => b.id === id)?.name || id, (id) => {
      const b = BUNDLES.find((x) => x.id === id);
      return { cookies: b?.cookies, drinks: b?.drinks, badge: b?.badge };
    }, 3);
    const boxSize = Object.entries(boxSizeTally).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // `favourites` kept as an alias of `cookies` for existing callers (subscribe wizard).
    return NextResponse.json({ ok: true, favourites: cookies, cookies, drinks, bundles, boxSize: boxSize ? Number(boxSize) : null });
  } catch (e: any) {
    console.error("[account/favourites] error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}
