// web/app/api/admin/whatsapp/route.ts — list WhatsApp chats, mute/unmute the bot per
// customer (temporary), and exclude/include a number permanently (suppliers, partners).
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canonicalPhone } from "@/lib/phone";

export const runtime = "nodejs";

// Mute lifts after the chat has been idle this long; each new message while muted
// rolls it forward (kept in sync with PAUSE_IDLE_HOURS in /api/whatsapp/inbound).
const MUTE_HOURS = 2;

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  try {
    const supa = supaAdmin();
    const { data: msgs } = await supa
      .from("wa_messages")
      .select("phone, role, text, created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    // Latest message + count per phone (newest-first, so first seen is latest).
    const byPhone = new Map<string, any>();
    for (const m of msgs || []) {
      const cur = byPhone.get(m.phone);
      if (!cur) byPhone.set(m.phone, { phone: m.phone, lastText: m.text, lastAt: m.created_at, lastRole: m.role, count: 1 });
      else cur.count++;
    }
    const phones = [...byPhone.keys()];
    const keys = phones.length ? phones : ["__none__"];

    const [stateRes, custRes] = await Promise.all([
      supa.from("wa_state").select("phone, auto_paused_until, bot_excluded").in("phone", keys),
      supa.from("customers").select("phone, name").in("phone", keys),
    ]);
    const stateMap = new Map((stateRes.data || []).map((s: any) => [s.phone, s]));
    const nameMap = new Map((custRes.data || []).map((c: any) => [c.phone, c.name]));

    const now = Date.now();
    const chats = phones
      .map((p) => {
        const r = byPhone.get(p);
        const st: any = stateMap.get(p);
        const pu = st?.auto_paused_until || null;
        const muted = pu ? new Date(pu).getTime() > now : false;
        return {
          ...r,
          name: nameMap.get(p) || null,
          mutedUntil: muted ? pu : null,
          excluded: !!st?.bot_excluded,
        };
      })
      .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));

    return NextResponse.json({ ok: true, chats });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const phone = canonicalPhone(b?.phone);
    if (!phone) return NextResponse.json({ ok: false, error: "No phone." }, { status: 400 });
    const supa = supaAdmin();

    // Two different switches, and only ever one per request — writing both would
    // let a mute toggle silently clear a permanent exclusion (the upsert sets
    // every column it is given).
    //   exclude: permanent opt-out, never expires  — suppliers, partners, our own lines
    //   mute:    temporary, lifts after MUTE_HOURS of quiet — a teammate is on it now
    const row: Record<string, any> = { phone, updated_at: new Date().toISOString() };
    if (typeof b?.exclude === "boolean") {
      row.bot_excluded = b.exclude;
      // Excluding supersedes a running mute; there is nothing left to resume to.
      if (b.exclude) row.auto_paused_until = null;
    } else {
      row.auto_paused_until = b?.mute === true
        ? new Date(Date.now() + MUTE_HOURS * 3600 * 1000).toISOString()
        : null;
    }

    const { error } = await supa.from("wa_state").upsert(row);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 400 });
  }
}
