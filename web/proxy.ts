import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
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
    pathname === "/favicon.ico" ||
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
  const { pathname, searchParams } = req.nextUrl;

  // Always allow Next assets
  if (isPublicAsset(pathname)) return NextResponse.next();

  // 1) Admin protection (Basic Auth)
  if (isAdminRoute(pathname)) {
    if (!checkAdminBasicAuth(req)) return basicUnauthorized();
    return NextResponse.next();
  }

  // 2) Allow all /api (so payments/webhooks still work)
  // If you want to block some APIs too, we can tighten later.
  if (isApiRoute(pathname)) return NextResponse.next();

  // 3) Soft Launch Gate (blocks public)
  if (softLaunchEnabled()) {
    const cookie = req.cookies.get("cd_softlaunch")?.value;
    const alreadyAuthed = cookie === "1";

    // allow visiting the gate page itself
    if (pathname === "/soft-launch") return NextResponse.next();

    // password pass via query: ?pass=XXX&next=/some/path
    const pass = searchParams.get("pass");
    const next = searchParams.get("next") || "/";

    const expected = process.env.SOFT_LAUNCH_PASS || "";

    if (!alreadyAuthed && pass && expected && pass === expected) {
      // set cookie and redirect to intended destination
      const url = req.nextUrl.clone();
      url.pathname = next;
      url.search = "";
      const res = NextResponse.redirect(url);
      res.cookies.set("cd_softlaunch", "1", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      return res;
    }

    if (!alreadyAuthed) {
      // send user to gate with next=their requested path
      const url = req.nextUrl.clone();
      url.pathname = "/soft-launch";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}
