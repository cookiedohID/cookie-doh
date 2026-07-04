// web/proxy.ts
import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/:path*"],
};

const COOKIE = "cd_admin";

// totalbuahstore.com is the TBS shop's own front door. To keep ONE basket +
// login domain (localStorage/cookies don't cross domains), the TBS domain
// REDIRECTS into the shop on cookiedoh.co.id:  / → /tbs, /product/<sku> →
// /tbs/p/<sku>, anything else → same path. Inert until the domain's DNS points
// at this deployment.
function tbsDomainRedirect(req: NextRequest): NextResponse | null {
  const host = (req.headers.get("host") || "").toLowerCase();
  if (!/(^|\.)totalbuahstore\.com$/.test(host)) return null;
  const { pathname, search } = req.nextUrl;
  const base = "https://www.cookiedoh.co.id";
  let target = pathname;
  if (pathname === "/" || pathname === "") target = "/tbs";
  else if (pathname.startsWith("/product/")) target = "/tbs/p/" + pathname.slice("/product/".length);
  return NextResponse.redirect(base + target + (search || ""), 308);
}

// SHA-256 hex of the password (Web Crypto, edge-safe). Must match the Node-side
// token in /api/admin/login.
async function expectedToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`cookie-doh::${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

export default async function proxy(req: NextRequest) {
  const tbsRedirect = tbsDomainRedirect(req);
  if (tbsRedirect) return tbsRedirect;

  const { pathname } = req.nextUrl;

  // ✅ Always allow Next assets and everything else (go-live safe mode)
  if (isPublicAsset(pathname)) return NextResponse.next();

  // 🔒 Admin gate — protect every /admin page and /api/admin route behind a
  // password. No-op until ADMIN_PASSWORD is set (so deploying never locks you out).
  const isAdminArea = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  const isLogin = pathname === "/admin/login" || pathname.startsWith("/api/admin/login");
  if (isAdminArea && !isLogin) {
    const password = process.env.ADMIN_BASIC_PASS || process.env.ADMIN_PASSWORD;
    if (password) {
      const cookie = req.cookies.get(COOKIE)?.value;
      const ok = Boolean(cookie) && cookie === (await expectedToken(password));
      if (!ok) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ ok: false, error: "Admin sign-in required." }, { status: 401 });
        }
        const url = req.nextUrl.clone();
        url.pathname = "/admin/login";
        url.searchParams.set("next", pathname);
        return NextResponse.redirect(url);
      }
    }
  }

  // ✅ Allow all API routes
  if (pathname.startsWith("/api")) return NextResponse.next();

  // ✅ Allow all pages (no auth, no redirects, no gating)
  return NextResponse.next();
}
