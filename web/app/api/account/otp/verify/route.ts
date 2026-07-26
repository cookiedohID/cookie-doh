// web/app/api/account/otp/verify/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { canonicalPhone } from "@/lib/phone";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

// If the caller is already signed in, bind the verification to their user so a
// once-verified phone can't later be claimed by a different account.
async function userIdFromBearer(supa: any, req: Request): Promise<string | null> {
  const h = req.headers.get("authorization") || "";
  const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
  if (!token) return null;
  const { data } = await supa.auth.getUser(token);
  return data?.user?.id ?? null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const phone = canonicalPhone(body?.phone);
    const code = String(body?.code || "").trim();
    if (!phone || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ ok: false, error: "Enter the 6-digit code." }, { status: 400 });
    }

    const supa = supaAdmin();
    const boundUserId = await userIdFromBearer(supa, req);
    const { data: row } = await supa
      .from("phone_otps")
      .select("code_hash, expires_at, attempts, verified")
      .eq("phone", phone)
      .maybeSingle();

    if (!row) return NextResponse.json({ ok: false, error: "Request a code first." }, { status: 400 });
    if (new Date(row.expires_at).getTime() < Date.now())
      return NextResponse.json({ ok: false, error: "Code expired — request a new one." }, { status: 400 });
    if (Number(row.attempts) >= 5)
      return NextResponse.json({ ok: false, error: "Too many tries — request a new code." }, { status: 429 });

    if (sha(code) !== row.code_hash) {
      await supa.from("phone_otps").update({ attempts: Number(row.attempts) + 1 }).eq("phone", phone);
      return NextResponse.json({ ok: false, error: "Incorrect code." }, { status: 400 });
    }

    const update: any = { verified: true };
    if (boundUserId) update.auth_user_id = boundUserId;
    await supa.from("phone_otps").update(update).eq("phone", phone);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}
