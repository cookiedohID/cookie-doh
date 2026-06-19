// web/app/api/cron/abandoned-cart/route.ts
// Secret-protected job: find carts that started checkout but never paid, and send
// one friendly WhatsApp with a link to finish. Call hourly from any cron service.
//
// Preferred (header form — keeps the secret out of request logs):
//   curl -H "x-cron-key: YOUR_SECRET" https://www.cookiedoh.co.id/api/cron/abandoned-cart
//   add &dry=1 (or ?dry=1) to preview only — sends nothing.
// The ?key=YOUR_SECRET query form also works for cron services that can't set headers.
//
// Secret = CRON_SECRET (or falls back to ADMIN_RETRY_SECRET so there's nothing new
// to configure). With no secret set, the endpoint is disabled (safe default).
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { sendWhatsApp } from "@/lib/whatsapp";
import { phoneSignificant } from "@/lib/phone";
import {
  NUDGE_MIN_AGE_MS,
  NUDGE_MAX_AGE_MS,
  NUDGE_MAX_PER_RUN,
  isNudgeable,
  buildNudgeText,
  type AbandonedOrder,
} from "@/lib/abandoned";

export const runtime = "nodejs";
export const maxDuration = 60;

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.ADMIN_RETRY_SECRET || "";
  if (!secret) return false; // disabled until a secret exists — never runs open
  const url = new URL(req.url);
  const provided =
    req.headers.get("x-cron-key") ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("key");
  return !!provided && provided === secret;
}

// One nudge per person: keep the newest cart per phone (query is created_at ASC,
// so the last write wins).
function dedupeByPhone(orders: AbandonedOrder[]): AbandonedOrder[] {
  const byPhone = new Map<string, AbandonedOrder>();
  for (const o of orders) {
    const key = phoneSignificant(o.customer_phone);
    if (!key) continue;
    byPhone.set(key, o);
  }
  return [...byPhone.values()];
}

async function run(req: Request) {
  // 404 (not 401) so the endpoint stays invisible to random scanners.
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const supabase = supaAdmin();
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");

  const now = Date.now();
  const newestIso = new Date(now - NUDGE_MIN_AGE_MS).toISOString(); // at least 1h old
  const oldestIso = new Date(now - NUDGE_MAX_AGE_MS).toISOString(); // within the window

  const { data, error } = await supabase
    .from("orders")
    .select("id, order_no, customer_name, customer_phone, total_idr, created_at, meta, items_json")
    .in("payment_status", ["PENDING", "UNPAID"])
    .is("nudged_at", null) // not nudged yet (the atomic claim below sets this)
    .gte("created_at", oldestIso)
    .lte("created_at", newestIso)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Honour broadcast opt-outs (graceful if the table isn't there yet).
  let optedOut = new Set<string>();
  try {
    const { data: outs } = await supabase.from("broadcast_optouts").select("phone");
    optedOut = new Set(
      (outs || []).map((o: any) => phoneSignificant(o.phone)).filter((x: string | null): x is string => !!x)
    );
  } catch {
    /* table optional */
  }

  const eligible = ((data as AbandonedOrder[]) || [])
    .filter(isNudgeable)
    .filter((o) => !optedOut.has(phoneSignificant(o.customer_phone) || ""));
  const candidates = dedupeByPhone(eligible).slice(0, NUDGE_MAX_PER_RUN);

  if (dry) {
    return NextResponse.json({
      ok: true,
      dry: true,
      scanned: data?.length || 0,
      eligible: candidates.length,
      sample: candidates.slice(0, 5).map((o) => ({
        name: o.customer_name || o.customer_phone,
        total: o.total_idr,
        ageH: Math.round((now - new Date(o.created_at).getTime()) / 3.6e6),
      })),
    });
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const BATCH = 5;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const slice = candidates.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (o) => {
        const token = randomUUID().replace(/-/g, "");

        // Atomic claim BEFORE sending: stamp nudged_at only if it's still null and
        // the order is still unpaid. If another run (or a retry) already claimed it,
        // zero rows come back and we skip — so a cart can never be nudged twice.
        const { data: claimed } = await supabase
          .from("orders")
          .update({ nudged_at: new Date().toISOString(), nudge_token: token })
          .eq("id", o.id)
          .is("nudged_at", null)
          .in("payment_status", ["PENDING", "UNPAID"])
          .select("id")
          .maybeSingle();
        if (!claimed) return; // lost the race, already nudged, or just paid

        const payUrl = `${site}/pay/${o.id}?t=${token}`;
        const res = await sendWhatsApp({ to: o.customer_phone, message: buildNudgeText(o, payUrl) });

        if (res.ok) {
          sent++;
          return;
        }
        if (res.skipped) {
          // Nothing actually went out (missing FONNTE_TOKEN / unreachable number).
          // Release the claim so a later run can retry once config is fixed.
          await supabase.from("orders").update({ nudged_at: null, nudge_token: null }).eq("id", o.id);
          skipped++;
          return;
        }
        // Fonnte rejected it (deterministic) — keep the claim so we don't hammer.
        failed++;
      })
    );
  }

  return NextResponse.json({ ok: true, scanned: data?.length || 0, eligible: candidates.length, sent, failed, skipped });
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
