// web/middleware.ts
import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/:path*"], // run middleware for all paths (we'll allowlist assets inside)
};

function basicUnauthorized() {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Cookie Doh Admin"' },
  });
}

function isAdminRoute(pathname: string) {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin")
  );
}


function isApiRoute(pathname: string) {
  return pathname.startsWith("/api");
}

function isPublicAsset(pathname: string) {
  return (
    pathname.startsWith("/_next/") || // ✅ critical for hydration
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

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ✅ 0) Always allow Next.js assets + public images
  if (isPublicAsset(pathname)) return NextResponse.next();

  // ✅ 1) Admin protection (Basic Auth)
  if (isAdminRoute(pathname)) {
    if (!checkAdminBasicAuth(req)) return basicUnauthorized();
    return NextResponse.next();
  }

  // 2) Allow PUBLIC APIs (stock, checkout helpers, etc.)
if (
  pathname.startsWith("/api/stock") ||
  pathname.startsWith("/api/shipping") ||
  pathname.startsWith("/api/checkout")
) {
  return NextResponse.next();
}

// 3) Allow other non-admin APIs
if (isApiRoute(pathname)) return NextResponse.next();


  // ✅ 3) Everything else is public
  return NextResponse.next();
}
