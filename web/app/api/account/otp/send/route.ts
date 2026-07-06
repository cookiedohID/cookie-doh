// web/app/api/account/otp/send/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { canonicalPhone } from "@/lib/phone";
import { sendWhatsApp } from "@/lib/whatsapp";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const phone = canonicalPhone(body?.phone);
    if (!phone) return NextResponse.json({ ok: false, error: "Enter a valid phone." }, { status: 400 });

    if (!process.env.FONNTE_TOKEN) {
      return NextResponse.json(
        { ok: false, error: "WhatsApp verification isn't configured yet." },
        { status: 503 }
      );
    }

    const supa = supaAdmin();

    // Throttle: one code per 45s per number.
    const { data: existing } = await supa
      .from("phone_otps")
      .select("last_sent_at, expires_at, attempts")
      .eq("phone", phone)
      .maybeSingle();
    if (existing?.last_sent_at && Date.now() - new Date(existing.last_sent_at).getTime() < 45_000) {
      return NextResponse.json({ ok: false, error: "Please wait a moment before requesting another code." }, { status: 429 });
    }
    // Lockout: don't mint a fresh code while the current one is still valid and
    // already burned its 5 attempts — otherwise an attacker loops
    // "5 guesses → resend (resets attempts) → 5 guesses" to brute the 6-digit code.
    if (
      existing &&
      Number(existing.attempts) >= 5 &&
      existing.expires_at &&
      new Date(existing.expires_at).getTime() > Date.now()
    ) {
      return NextResponse.json(
        { ok: false, error: "Too many attempts on the current code. Wait a few minutes and try again." },
        { status: 429 }
      );
    }

    // CSPRNG (not Math.random, whose sequence can be predicted from prior outputs).
    const code = String(crypto.randomInt(100000, 1000000)); // 6 digits
    const now = new Date();
    const expires = new Date(now.getTime() + 5 * 60_000);

    const { error } = await supa.from("phone_otps").upsert(
      {
        phone,
        code_hash: sha(code),
        expires_at: expires.toISOString(),
        verified: false,
        attempts: 0,
        last_sent_at: now.toISOString(),
      },
      { onConflict: "phone" }
    );
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const sent = await sendWhatsApp({
      to: phone,
      message: `Your Cookie Doh verification code is ${code}. It expires in 5 minutes. 🍪`,
    });
    if (!sent.ok) {
      return NextResponse.json({ ok: false, error: sent.error || "Couldn't send WhatsApp code." }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}
