// web/app/api/tbs/product/route.ts — single-product detail proxy (Kurly-style
// product page): price at the chosen store, availability across ALL stores,
// related items. Gated + cached like the other TBS proxies.
import { NextResponse } from "next/server";
import { canSeeTbsShop, partnerGet } from "@/lib/tbsShop";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!(await canSeeTbsShop(req))) return NextResponse.json({ ok: false }, { status: 404 });
  try {
    const u = new URL(req.url);
    const store = String(u.searchParams.get("store") || "").toUpperCase();
    const sku = String(u.searchParams.get("sku") || "").slice(0, 40);
    if (!/^[A-Z0-9-]{2,20}$/.test(store) || !sku) return NextResponse.json({ ok: false, error: "bad params" }, { status: 400 });
    const data = await partnerGet("/product", { store, sku });
    if (!data) return NextResponse.json({ ok: false, error: "tbs_unreachable" }, { status: 200 });
    return NextResponse.json({ ok: true, ...data });
  } catch {
    return NextResponse.json({ ok: false, error: "error" }, { status: 200 });
  }
}
