// web/app/api/auth/reset/phone/verify/route.ts — verify a WhatsApp reset code and
// return a short-lived reset token (the same token the email link carries). The
// client then opens /account/reset?token=… to set the new password (that step
// bumps token_version, so the token is single-use).
import { NextResponse } from "next/server";
import { verifyPhoneReset } from "@/lib/memberAuthServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const r = await verifyPhoneReset(String(b?.phone || ""), String(b?.code || ""));
    if (r.error) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, token: r.token });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't verify the code. Please try again." }, { status: 500 });
  }
}
