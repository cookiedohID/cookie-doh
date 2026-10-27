// web/app/api/auth/reset/request/route.ts — email a password-reset link. Always
// returns ok (never reveals whether the email exists).
import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/memberAuthServer";
import { throttleAuth } from "@/lib/authThrottle";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    // Throttle to prevent reset-email spam to a victim's inbox. Still returns ok
    // (never reveal existence) — the throttle just skips the send when over limit.
    const blocked = await throttleAuth(req, "reset", String(b?.email || ""), { ipMax: 15, idMax: 4 });
    if (!blocked) await requestPasswordReset(String(b?.email || ""));
  } catch { /* always silent */ }
  return NextResponse.json({ ok: true });
}
