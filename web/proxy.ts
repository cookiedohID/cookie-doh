// web/proxy.ts
import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/:path*"],
};

function basicUnauthorized() {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Cookie Doh Admin"' },
  });
}

function isAdminRoute(pathname: string) {
  return pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
}

function isApiRoute(pathname: string) {
  return pathname.startsWith("/api");
}

function isPublicAsset(pathname: string) {
  return (
    pathname.startsWith("/_next/") || // critical for hydration
    pathname === "/favicon.ico" ||
    pathname === "/icon.png" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/logo.png" ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/flavors/")
  );
}

function checkAdminBasicAuth(req: NextRequest) {
  const user = process.env.ADMIN_BASIC_USER;
  const pass = process.env.ADMIN_BASIC_PASS;
  if (!user || !pass) return false;

  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Basic ")) return false;

  const b64 = auth.slice("Basic ".length).trim();

  let decoded = "";
  try {
    decoded = atob(b64);
  } catch {
    return false;
  }

  const idx = decoded.indexOf(":");
  if (idx < 0) return false;

  const u = decoded.slice(0, idx);
  const p = decoded.slice(idx + 1);

  return u === user && p === pass;
}

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 0) Always allow Next assets so React hydrates + buttons work
  if (isPublicAsset(pathname)) return NextResponse.next();

  // 1) Protect admin routes only
  if (isAdminRoute(pathname)) {
    if (!checkAdminBasicAuth(req)) return basicUnauthorized();
    return NextResponse.next();
  }

  // 2) Allow all API routes
  if (isApiRoute(pathname)) return NextResponse.next();

  // 3) Everything else public
  return NextResponse.next();
}
