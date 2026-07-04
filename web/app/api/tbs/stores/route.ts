// web/app/api/tbs/stores/route.ts — live TBS store list for the picker.
// Gated by the shop flag/preview. Falls back to the 3 known stores while the
// ERP's cloud stock feed is still empty (marked stockSynced:false so the UI
// can say "stock syncing").
import { NextResponse } from "next/server";
import { canSeeTbsShop, partnerGet, TBS_FALLBACK_STORES } from "@/lib/tbsShop";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!canSeeTbsShop(req)) return NextResponse.json({ ok: false }, { status: 404 });
  try {
    const live = await partnerGet("/stores", {});
    const stores = Array.isArray(live) && live.length ? live : TBS_FALLBACK_STORES;
    return NextResponse.json({ ok: true, stockSynced: Array.isArray(live) && live.length > 0, stores });
  } catch {
    return NextResponse.json({ ok: true, stockSynced: false, stores: TBS_FALLBACK_STORES });
  }
}
