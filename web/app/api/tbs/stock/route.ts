// web/app/api/tbs/stock/route.ts — live stock/price re-check for basket lines
// (supports SKU@UOM variant codes). Gated like the other TBS proxies; used by
// the cart's auto-refresh so stale baskets flag themselves before checkout.
import { NextResponse } from "next/server";
import { canSeeTbsShop, partnerGet } from "@/lib/tbsShop";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!canSeeTbsShop(req)) return NextResponse.json({ ok: false }, { status: 404 });
  try {
    const u = new URL(req.url);
    const store = String(u.searchParams.get("store") || "").toUpperCase();
    const skus = String(u.searchParams.get("skus") || "").slice(0, 3000);
    if (!/^[A-Z0-9-]{2,20}$/.test(store) || !skus) return NextResponse.json({ ok: false, error: "bad params" }, { status: 400 });
    const data = await partnerGet("/stock", { store, skus });
    if (!Array.isArray(data)) return NextResponse.json({ ok: false, error: "tbs_unreachable" }, { status: 200 });
    return NextResponse.json({ ok: true, items: data });
  } catch {
    return NextResponse.json({ ok: false, error: "error" }, { status: 200 });
  }
}
