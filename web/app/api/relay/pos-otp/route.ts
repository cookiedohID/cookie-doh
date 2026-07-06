// web/app/api/relay/pos-otp/route.ts — WhatsApp delivery relay for the TBS
// POS loyalty-redemption OTP (owner: "use cookiedoh's provider" = Fonnte).
//
// POST { phone, code } or { phone, message } with header x-relay-key.
// The key lives in app_settings (pos_otp_relay_secret) — deliberately NOT in
// the admin settings allowlist, so it can't be read through any UI/API; the
// same value is handed to infra via GCP Secret Manager (never chat/git).
// Scope-limited: one message shape, 300-char cap, light per-phone throttle —
// this is an OTP relay, not a general message gateway.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSetting } from "@/lib/settings";
import { sendWhatsApp } from "@/lib/whatsapp";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

// best-effort per-phone throttle (per warm instance; Fonnte is flat-fee so
// this is abuse hygiene, not cost protection)
const RECENT = new Map<string, number[]>();
function throttled(phone: string): boolean {
  const now = Date.now();
  const arr = (RECENT.get(phone) || []).filter((t) => now - t < 3600_000);
  if (arr.length >= 6) return true;
  arr.push(now);
  RECENT.set(phone, arr);
  return false;
}

export async function POST(req: Request) {
  try {
    const secret = await getSetting(supaAdmin(), "pos_otp_relay_secret");
    const given = req.headers.get("x-relay-key") || "";
    if (!secret || given.length !== secret.length || given !== secret) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const b = await req.json().catch(() => ({}));
    const digits = String(b?.phone || "").replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) {
      return NextResponse.json({ ok: false, error: "valid phone required" }, { status: 400 });
    }
    const phone = digits.startsWith("62") ? digits : "62" + digits.replace(/^0/, "");

    let message: string;
    if (b?.code != null) {
      const code = String(b.code).replace(/\D/g, "").slice(0, 8);
      if (code.length < 4) return NextResponse.json({ ok: false, error: "valid code required" }, { status: 400 });
      message = `🔐 Kode OTP TotalBuahStore Anda: *${code}*\n\nUntuk penukaran poin di kasir. Berlaku beberapa menit — JANGAN bagikan kode ini kepada siapa pun, termasuk staf.`;
    } else {
      message = String(b?.message || "").trim().slice(0, 300);
      if (!message) return NextResponse.json({ ok: false, error: "code or message required" }, { status: 400 });
    }

    if (throttled(phone)) return NextResponse.json({ ok: false, error: "too many messages to this number — try again later" }, { status: 429 });

    const res = await sendWhatsApp({ to: phone, message });
    return NextResponse.json(res.ok ? { ok: true } : { ok: false, error: res.error || "send failed" }, { status: res.ok ? 200 : 502 });
  } catch (e: any) {
    console.error("route error:", e); return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
