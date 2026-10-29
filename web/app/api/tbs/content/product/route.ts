// web/app/api/tbs/content/product/route.ts — one product page's data: the
// owner's content (copy, photos, recipes, facts) + the ERP's live price,
// availability and box variants for the chosen store. `id` accepts the sheet's
// product id, the SKU or the slug. Gated like every TBS route.
import { NextResponse } from "next/server";
import { canSeeTbsShop } from "@/lib/tbsShop";
import { productDetail } from "@/lib/tbsContent";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!(await canSeeTbsShop(req))) return NextResponse.json({ ok: false }, { status: 404 });
  try {
    const u = new URL(req.url);
    const store = String(u.searchParams.get("store") || "").toUpperCase();
    const id = String(u.searchParams.get("id") || "").slice(0, 120);
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    if (store && !/^[A-Z0-9-]{2,20}$/.test(store)) return NextResponse.json({ ok: false, error: "bad store" }, { status: 400 });
    const d = await productDetail(id, store);
    if (!d) return NextResponse.json({ ok: true, found: false });
    return NextResponse.json({ ok: true, found: true, ...d }, { headers: { "Cache-Control": "private, max-age=20" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 200 });
  }
}
