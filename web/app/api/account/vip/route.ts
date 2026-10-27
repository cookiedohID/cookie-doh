// web/app/api/account/vip/route.ts — the signed-in member's VIP status.
// Phone is the OTP-verified bound phone (never request input), so perks can't be
// claimed by typing someone else's number.
import { NextResponse } from "next/server";
import { supaAdmin } from "@/lib/supaAdmin";
import { getMember } from "@/lib/memberServer";
import { vipStatusForPhone } from "@/lib/vip";

export const runtime = "nodejs";

// data client → Cloud SQL (pg shim) via lib/supaAdmin; .auth still Supabase (P3).

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
