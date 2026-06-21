// web/app/api/midtrans/webhook/route.ts
// LEGACY Midtrans webhook path. The canonical handler is
// /api/midtrans/notification (configured in the Midtrans dashboard). This route
// used to be a DIVERGENT duplicate (it skipped loyalty/referral/promo settling),
// which was a footgun if Midtrans ever pointed here. Instead of deleting it (and
// risking payments on any stale config), it now delegates to the canonical
// handler, so the two can never diverge again.
export const runtime = "nodejs";
export { POST } from "../notification/route";
