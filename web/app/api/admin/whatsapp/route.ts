// web/app/api/admin/whatsapp/route.ts — list WhatsApp chats + mute/unmute the bot per customer.
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
      supa.from("wa_state").select("phone, auto_paused_until").in("phone", keys),
      supa.from("customers").select("phone, name").in("phone", keys),
    ]);
    const stateMap = new Map((stateRes.data || []).map((s: any) => [s.phone, s.auto_paused_until]));
    const nameMap = new Map((custRes.data || []).map((c: any) => [c.phone, c.name]));

    const now = Date.now();
    const chats = phones
      .map((p) => {
        const r = byPhone.get(p);
        const pu = stateMap.get(p);
        const muted = pu ? new Date(pu).getTime() > now : false;
        return { ...r, name: nameMap.get(p) || null, mutedUntil: muted ? pu : null };
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
    const mute = b?.mute === true;
    if (!phone) return NextResponse.json({ ok: false, error: "No phone." }, { status: 400 });
    const supa = supaAdmin();
    const auto_paused_until = mute ? new Date(Date.now() + MUTE_HOURS * 3600 * 1000).toISOString() : null;
    const { error } = await supa.from("wa_state").upsert({ phone, auto_paused_until, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 400 });
  }
}
