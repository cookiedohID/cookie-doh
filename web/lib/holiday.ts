// web/lib/holiday.ts — "on holiday / upgrading" mode for the Cookie Doh storefront.
// CATALOG MODE (owner's call): customers can still BROWSE the whole shop (flavours,
// prices, bundles) — a warm banner explains the break — but ORDERING is paused:
// the checkout page shows the warm HolidaySplash and the /api/checkout order API
// is closed. Staff surfaces (/admin, /cafe), the TotalBuahStore section (/tbs, which
// checks out via its own /api/tbs/checkout) and all other APIs keep working.
//
// It LIFTS ITSELF automatically on the return date below — no action needed to
// reopen in September. To reopen EARLY, set HOLIDAY_ENABLED to false and redeploy.

export const HOLIDAY_ENABLED = true;

// Warm label shown to customers, and the exact moment the shop reopens (WIB).
export const HOLIDAY_RETURN_LABEL = "September 2026";
export const HOLIDAY_RETURN_ISO = "2026-09-01T00:00:00+07:00";

// Contact channels kept open during the break.
export const HOLIDAY_WHATSAPP = "6281932181818";
export const HOLIDAY_INSTAGRAM = "cookiedoh.co.id";

export function holidayActive(): boolean {
  if (!HOLIDAY_ENABLED) return false;
  const until = Date.parse(HOLIDAY_RETURN_ISO);
  if (Number.isNaN(until)) return true; // bad date → stay safe-closed until fixed
  return Date.now() < until; // auto-reopens the instant the return date passes
}

// Fully-normal surfaces — no banner, no ordering pause: staff + the TBS section.
export function isExemptFromHoliday(pathname: string): boolean {
  return (
    pathname === "/admin" || pathname.startsWith("/admin/") ||
    pathname === "/cafe" || pathname.startsWith("/cafe/") ||
    pathname === "/tbs" || pathname.startsWith("/tbs/") ||
    pathname.startsWith("/api") || pathname.startsWith("/_next")
  );
}

// The Cookie Doh ordering funnel — the ONE step we pause with the warm splash.
// (Browsing/cart stay open; the cart's "checkout" button routes here, and the
// /api/checkout API is also closed as a backstop.) /checkout/success is NOT gated
// so any in-flight confirmation can still render.
export function isOrderingPath(pathname: string): boolean {
  return pathname === "/checkout";
}
