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
    const skus = String(u.searchParams.get("skus") || "").slice(0, 8000);
    if (!/^[A-Z0-9-]{2,20}$/.test(store) || !skus) return NextResponse.json({ ok: false, error: "bad params" }, { status: 400 });
    // the ERP prices at most 60 SKUs per call — chunk bigger baskets so lines
    // 61+ never get falsely flagged as gone (cap at 3 chunks = 180 lines)
    const list = [...new Set(skus.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 180);
    const chunks: string[][] = [];
    for (let i = 0; i < list.length; i += 60) chunks.push(list.slice(i, i + 60));
    const parts = await Promise.all(chunks.map((c) => partnerGet("/stock", { store, skus: c.join(",") })));
    if (parts.some((d) => !Array.isArray(d))) return NextResponse.json({ ok: false, error: "tbs_unreachable" }, { status: 200 });
    return NextResponse.json({ ok: true, items: (parts as any[][]).flat() });
  } catch {
    return NextResponse.json({ ok: false, error: "error" }, { status: 200 });
  }
}
