// web/app/api/account/vip/route.ts — the signed-in member's VIP status.
// Phone is the OTP-verified bound phone (never request input), so perks can't be
// claimed by typing someone else's number.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMember } from "@/lib/memberServer";
import { vipStatusForPhone } from "@/lib/vip";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    const supa = supaAdmin();
    const member = await getMember(supa, req);
    if (!member?.ownerPhone) return NextResponse.json({ ok: true, status: null });
    const status = await vipStatusForPhone(supa, member.ownerPhone);
    return NextResponse.json({ ok: true, status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
