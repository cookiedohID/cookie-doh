// web/app/api/loyalty/redeem-otp/verify/route.ts
// Verify the redemption code the member received on WhatsApp. On success the row
// is cleared (single-use). Used at the POS to unlock applying free rewards.
import { NextResponse } from "next/server";
import { supaAdmin } from "@/lib/supaAdmin";
import crypto from "crypto";
import { canonicalPhone } from "@/lib/phone";

export const runtime = "nodejs";

// data client → Cloud SQL (pg shim) via lib/supaAdmin; .auth still Supabase (P3).

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const phone = canonicalPhone(body?.phone);
    const code = String(body?.code || "").trim();
    if (!phone || !code) return NextResponse.json({ ok: false, error: "Missing phone or code." }, { status: 400 });

    const supa = supaAdmin();
    const { data: row } = await supa
      .from("redemption_otps")
      .select("code_hash, expires_at, attempts")
      .eq("phone", phone)
      .maybeSingle();

    if (!row) return NextResponse.json({ ok: false, error: "No code requested. Send one first." }, { status: 400 });
    if (new Date(row.expires_at).getTime() < Date.now()) return NextResponse.json({ ok: false, error: "Code expired. Send a new one." }, { status: 400 });
    if (Number(row.attempts) >= 5) return NextResponse.json({ ok: false, error: "Too many attempts. Send a new code." }, { status: 429 });

    if (sha(code) !== row.code_hash) {
      await supa.from("redemption_otps").update({ attempts: Number(row.attempts) + 1 }).eq("phone", phone);
      return NextResponse.json({ ok: false, error: "Incorrect code." }, { status: 400 });
    }

    // Correct — single-use: clear it.
    await supa.from("redemption_otps").delete().eq("phone", phone);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}
