// web/app/api/tbs/enabled/route.ts — is the TBS shop visible to this visitor?
// Public flag OR the owner's admin cookie (preview mode). The header uses this
// to decide whether to show the TotalBuahStore nav tab.
import { NextResponse } from "next/server";
import { canSeeTbsShop, tbsShopPublic } from "@/lib/tbsShop";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const [enabled, pub] = await Promise.all([canSeeTbsShop(req), tbsShopPublic()]);
  return NextResponse.json(
    { enabled, preview: enabled && !pub, tabVisible: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
