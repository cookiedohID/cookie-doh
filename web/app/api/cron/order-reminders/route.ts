// web/app/api/cron/order-reminders/route.ts
// Hourly: WhatsApp the OWNER a consolidated reminder of PAID orders that haven't
// been accepted yet (created in the last 24h). Stops as soon as each is accepted.
//
//   GET /api/cron/order-reminders        (header x-cron-key: CRON_SECRET) -> send
//   GET /api/cron/order-reminders?dry=1  -> count only, send nothing
import { NextResponse } from "next/server";
import { cronAuthorized, supaService } from "@/lib/cron";
import { remindUnacceptedOrders } from "@/lib/orderComms";

export const runtime = "nodejs";
export const maxDuration = 60;

async function run(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.cookiedoh.co.id";
  try {
    const r = await remindUnacceptedOrders(supaService(), siteUrl, dry);
    return NextResponse.json({ ok: true, dry, ...r });
  } catch (e: any) {
    console.error("[cron/order-reminders] error:", e);
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
