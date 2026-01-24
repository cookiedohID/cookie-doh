import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icon.png|robots.txt|sitemap.xml).*)",
  ],
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
    pathname.startsWith("/_next") ||
    pathname === "/icon.png" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
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

function softLaunchEnabled() {
  return String(process.env.SOFT_LAUNCH_ENABLED ?? "").toLowerCase() === "true";
}

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // allow next assets
  if (isPublicAsset(pathname)) return NextResponse.next();

  // 1) Admin protection (Basic Auth)
  if (isAdminRoute(pathname)) {
    if (!checkAdminBasicAuth(req)) return basicUnauthorized();
    return NextResponse.next();
  }

  // 2) Allow all /api (so webhooks/payments still work)
  // Admin API is already protected above.
  if (isApiRoute(pathname)) return NextResponse.next();

  // 3) Soft Launch Gate (public pages)
  if (softLaunchEnabled()) {
    const cookie = req.cookies.get("cd_softlaunch")?.value;
    const alreadyAuthed = cookie === "1";

    // allow the gate page itself
    if (pathname === "/soft-launch") return NextResponse.next();

    if (!alreadyAuthed) {
      const url = req.nextUrl.clone();
      url.pathname = "/soft-launch";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}
