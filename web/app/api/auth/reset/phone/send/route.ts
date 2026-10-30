// web/app/api/auth/reset/phone/send/route.ts — send a WhatsApp OTP so a password
// account can reset via phone (the primary recovery path, since phone is the
// membership key and email is optional). Always returns ok for an unknown number
// (never reveals whether a number is a member); surfaces only validation and
// per-number throttle errors.
import { NextResponse } from "next/server";
import { requestPhoneReset } from "@/lib/memberAuthServer";
import { throttleAuth } from "@/lib/authThrottle";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const phone = String(b?.phone || "");
    // IP/identity window to blunt enumeration + WhatsApp spam. Silent when over
    // the limit (don't reveal membership), matching the email reset route.
    const throttled = await throttleAuth(req, "reset-phone", phone, { ipMax: 15, idMax: 4 });
    if (throttled) return NextResponse.json({ ok: true });
    const r = await requestPhoneReset(phone);
    if (r.throttled) return NextResponse.json({ ok: false, error: r.error }, { status: 429 });
    if (r.error) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
