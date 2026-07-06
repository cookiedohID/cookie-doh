// web/app/api/cron/partner-canary/route.ts — daily heartbeat for the Cookie
// Doh ↔ TBS ERP partner connection. The 2026-07-05 central-auth change
// silently 401'd every partner POST for hours; this canary makes the NEXT
// silent break page the owner within hours instead of surfacing at checkout.
// Checks: GET /stores (read path), POST /member re-upsert of the dedicated
// test member (idempotent by design — safe every run). WhatsApps the owner
// ONLY on failure.
import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { partnerGet, partnerPost } from "@/lib/tbsShop";
import { sendWhatsApp } from "@/lib/whatsapp";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const failures: string[] = [];
  try {
    const stores = await partnerGet("/stores", {});
    const list = Array.isArray(stores?.stores) ? stores.stores : Array.isArray(stores) ? stores : null;
    if (!list || list.length < 1) failures.push("GET /stores returned no stores");
  } catch { failures.push("GET /stores unreachable"); }
  try {
    const r = await partnerPost("/member", { phone: "+6281100000001", name: "Sync Test" });
    if (!r || r.ok !== true) failures.push(`POST /member failed: ${(r && (r.error || r.message)) || "no response"}`);
  } catch { failures.push("POST /member unreachable"); }

  if (failures.length) {
    try {
      await sendWhatsApp({
        message: `🚨 TBS partner API canary FAILED:\n- ${failures.join("\n- ")}\n\nPaid-order push / member sync / points may be affected. Check the last tbs-backoffice deploy (auth gate must exempt /api/partner/*).`,
      });
    } catch { /* alerting is best-effort */ }
  }
  return NextResponse.json({ ok: failures.length === 0, failures });
}
