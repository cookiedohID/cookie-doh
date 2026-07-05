// web/app/api/cron/tbs-members/route.ts — unified member DB, TBS → CD side:
// pull members registered at the tills (partner GET /members?since=) and mirror
// them into `customers` by canonical phone. Cursor lives in app_settings
// (tbs_member_sync_since). Hourly via GitHub Actions (x-cron-key).
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cronAuthorized } from "@/lib/cron";
import { partnerGet } from "@/lib/tbsShop";
import { getSetting, setSetting } from "@/lib/settings";
import { canonicalPhone } from "@/lib/phone";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const supa = supaAdmin();
    const since = (await getSetting(supa, "tbs_member_sync_since")) || "1970-01-01T00:00:00Z";
    const rows = await partnerGet("/members", { since, limit: "500" });
    if (!Array.isArray(rows)) return NextResponse.json({ ok: false, error: "tbs_unreachable" }, { status: 200 });

    let upserts = 0, cursor = since;
    for (const m of rows) {
      const phone = canonicalPhone(String(m?.phone || ""));
      if (!phone) continue;
      const { data: existing } = await supa.from("customers").select("id, name").eq("phone", phone).maybeSingle();
      if (!existing) {
        await supa.from("customers").insert({
          phone,
          name: String(m?.name || "").slice(0, 120) || null,
          ...(m?.email ? { email: String(m.email).slice(0, 160) } : {}),
        });
        upserts++;
      } else if (!existing.name && m?.name) {
        await supa.from("customers").update({ name: String(m.name).slice(0, 120) }).eq("id", existing.id);
      }
      if (m?.updated_at && String(m.updated_at) > cursor) cursor = String(m.updated_at);
    }
    if (cursor !== since) await setSetting(supa, "tbs_member_sync_since", cursor);
    return NextResponse.json({ ok: true, pulled: rows.length, created: upserts, cursor });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
