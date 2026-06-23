// web/app/api/cron/subscriptions/route.ts
// Daily subscription autopilot (ONE endpoint so the steps run in order):
//   • materialize boxes due today into normal paid orders (+ bonus cookie)
//   • D-2 / D-1 "still in town?" reminders
//   • sweep stale pending plans
//
//   GET /api/cron/subscriptions        (header x-cron-key: CRON_SECRET) -> run
//   GET /api/cron/subscriptions?dry=1  -> report what WOULD happen, change nothing
import { NextResponse } from "next/server";
import { cronAuthorized, supaService } from "@/lib/cron";
import { runSubscriptionCron } from "@/lib/subscriptionMaterialize";

export const runtime = "nodejs";
export const maxDuration = 120;

async function run(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.cookiedoh.co.id";
  try {
    const result = await runSubscriptionCron(supaService(), { siteUrl, dry });
    return NextResponse.json({ ok: true, dry, ...result });
  } catch (e: any) {
    console.error("[cron/subscriptions] error:", e);
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
