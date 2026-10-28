// web/app/api/tbs/content/catalog/route.ts — the TotalBuahStore catalogue as the
// owner's product master defines it (every LISTED product, with photos and
// categories), overlaid with live price/stock from the ERP for the SKUs it sells.
// Gated like every TBS route.
import { NextResponse } from "next/server";
import { canSeeTbsShop } from "@/lib/tbsShop";
import { catalogPage, categories, categoryCounts } from "@/lib/tbsContent";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!(await canSeeTbsShop(req))) return NextResponse.json({ ok: false }, { status: 404 });
  try {
    const u = new URL(req.url);
    const store = String(u.searchParams.get("store") || "").toUpperCase();
    if (store && !/^[A-Z0-9-]{2,20}$/.test(store)) return NextResponse.json({ ok: false, error: "bad store" }, { status: 400 });
    const category = String(u.searchParams.get("category") || "").slice(0, 10).replace(/[^0-9A-Za-z]/g, "");
    const sub = String(u.searchParams.get("sub") || "").slice(0, 10).replace(/[^0-9A-Za-z]/g, "");
    const q = String(u.searchParams.get("q") || "").slice(0, 60);
    const sort = String(u.searchParams.get("sort") || "");
    const offset = Math.max(0, parseInt(u.searchParams.get("offset") || "0", 10) || 0);
    const limit = Math.min(60, Math.max(1, parseInt(u.searchParams.get("limit") || "36", 10) || 36));
    const [page, cats, counts] = await Promise.all([
      catalogPage({ store, category, sub, q, sort, offset, limit }), categories(), categoryCounts(),
    ]);
    return NextResponse.json({
      ok: true, store, offset, total: page.total, items: page.items,
      categories: cats.map((c) => ({ ...c, count: counts[c.code] || 0 })),
    }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 200 });
  }
}
