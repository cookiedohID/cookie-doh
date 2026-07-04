// web/app/api/tbs/preview/route.ts — unlock the TotalBuahStore preview with a
// shared password: /api/tbs/preview?key=… sets a 30-day cookie and lands on /tbs.
// Soft gate for invited viewers pre-launch; irrelevant once TBS_SHOP_PUBLIC.
import { NextResponse } from "next/server";
import { tbsPreviewCookie } from "@/lib/tbsShop";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const val = tbsPreviewCookie(String(u.searchParams.get("key") || ""));
  const res = NextResponse.redirect(new URL("/tbs", u.origin));
  if (val) {
    res.cookies.set("cd_tbs", val, {
      httpOnly: true, sameSite: "lax", secure: true, path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}
