// web/app/api/tbs/enabled/route.ts — is the TBS shop visible to this visitor?
// enabled = public flag OR this signed-in member's email is on the TBS allow-list
// (canSeeTbsShop). The header shows the TotalBuahStore nav tab only when enabled,
// so a signed-out / non-approved visitor never sees it.
import { NextResponse } from "next/server";
import { canSeeTbsShop, tbsShopPublic } from "@/lib/tbsShop";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const [enabled, pub] = await Promise.all([canSeeTbsShop(req), tbsShopPublic()]);
  return NextResponse.json(
    { enabled, preview: enabled && !pub },
    { headers: { "Cache-Control": "no-store" } }
  );
}
