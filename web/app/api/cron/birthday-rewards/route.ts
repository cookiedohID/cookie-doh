// web/app/api/cron/birthday-rewards/route.ts
// Daily: grant a free cookie + send a "happy birthday" WhatsApp to members whose
// birthday (MM-DD, Asia/Jakarta) is today. One grant per member per year —
// loyalty_grants UNIQUE(reason, ref) makes it idempotent if the cron runs twice.
//
//   GET /api/cron/birthday-rewards            (header x-cron-key: SECRET) -> grant + send
//   GET /api/cron/birthday-rewards?dry=1      -> preview, grants/sends nothing
import { NextResponse } from "next/server";
import { cronAuthorized, supaService } from "@/lib/cron";
import { canonicalPhone, phoneSignificant } from "@/lib/phone";
import { sendWhatsApp } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const maxDuration = 60;

const WIB = 7 * 3600 * 1000;

function firstName(name: string | null): string {
  const n = (name || "").trim();
  return n ? n.split(/\s+/)[0] : "there";
}

async function run(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const supa = supaService();

  const wibNow = new Date(Date.now() + WIB);
  const mm = String(wibNow.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(wibNow.getUTCDate()).padStart(2, "0");
  const today = `${mm}-${dd}`;
  const year = wibNow.getUTCFullYear();

  const { data: custs } = await supa
    .from("customers")
    .select("phone, name, birthday")
    .eq("birthday", today)
    .not("phone", "is", null);

  const matched = (custs || []).filter((c: any) => phoneSignificant(c?.phone));

  if (dry) {
    return NextResponse.json({ ok: true, dry: true, date: today, matched: matched.length, sample: matched.slice(0, 5).map((c: any) => c.name || c.phone) });
  }

  let granted = 0;
  let skipped = 0;
  let failed = 0;
  for (const c of matched) {
    const sig = phoneSignificant(c.phone)!;
    const ref = `bday-${sig}-${year}`;
    // Claim the year's grant first; UNIQUE(reason, ref) => second run gets an error
    // and we skip (no duplicate cookie, no duplicate message).
    const { error: gErr } = await supa
      .from("loyalty_grants")
      .insert({ phone: canonicalPhone(c.phone) || c.phone, cookies: 1, drinks: 0, reason: "birthday", ref });
    if (gErr) {
      skipped++;
      continue;
    }
    const res = await sendWhatsApp({
      to: c.phone,
      message: `🎂 Happy birthday, ${firstName(c.name)}! From all of us at Cookie Doh — here's a FREE cookie on us 🍪 Redeem it on your next order or at the counter. Have the sweetest day! 💛`,
    });
    if (res.ok) granted++;
    else failed++;
  }

  return NextResponse.json({ ok: true, date: today, matched: matched.length, granted, skipped, failed });
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
