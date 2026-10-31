// web/app/api/tbs/preview/route.ts — the old shared "preview password" is RETIRED.
// /tbs is now restricted to approved, signed-in member emails (see lib/tbsShop
// canSeeTbsShop), so this endpoint no longer sets any cookie — it just lands the
// visitor on /tbs, which shows the sign-in gate unless they're an approved member.
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  return NextResponse.redirect(new URL("/tbs", u.origin));
}
