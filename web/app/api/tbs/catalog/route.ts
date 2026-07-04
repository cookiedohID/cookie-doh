// web/app/api/tbs/catalog/route.ts — proxy to the ERP's curated catalog
// (top-80%-of-revenue-per-category SKUs × live per-store price + stock).
// Gated by the shop flag/preview; token stays server-side; 2-min cached.
import { NextResponse } from "next/server";
import { canSeeTbsShop, partnerGet } from "@/lib/tbsShop";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!canSeeTbsShop(req)) return NextResponse.json({ ok: false }, { status: 404 });
  try {
    const u = new URL(req.url);
    const store = String(u.searchParams.get("store") || "").toUpperCase();
    if (!/^[A-Z0-9-]{2,20}$/.test(store)) return NextResponse.json({ ok: false, error: "bad store" }, { status: 400 });
    const data = await partnerGet("/catalog", {
      store,
      category: String(u.searchParams.get("category") || "").slice(0, 30),
      q: String(u.searchParams.get("q") || "").slice(0, 60),
      offset: String(Math.max(0, parseInt(u.searchParams.get("offset") || "0", 10) || 0)),
      limit: String(Math.min(60, Math.max(1, parseInt(u.searchParams.get("limit") || "24", 10) || 24))),
    });
    if (!data) return NextResponse.json({ ok: false, error: "tbs_unreachable" }, { status: 200 });
    return NextResponse.json({ ok: true, ...data });
  } catch {
    return NextResponse.json({ ok: false, error: "error" }, { status: 200 });
  }
}
