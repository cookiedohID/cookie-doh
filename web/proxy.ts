// web/proxy.ts
import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/:path*"],
};

function isPublicAsset(pathname: string) {
  return (
    pathname.startsWith("/_next/") || // includes _next/static, _next/image, _next/data
    pathname === "/favicon.ico" ||
    pathname === "/icon.png" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/logo.png" ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/flavors/")
  );
}

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ✅ Always allow Next assets and everything else (go-live safe mode)
  if (isPublicAsset(pathname)) return NextResponse.next();

  // ✅ Allow all API routes
  if (pathname.startsWith("/api")) return NextResponse.next();

  // ✅ Allow all pages (no auth, no redirects, no gating)
  return NextResponse.next();
}
