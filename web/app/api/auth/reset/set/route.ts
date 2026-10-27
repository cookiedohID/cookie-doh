// web/app/api/auth/reset/set/route.ts — set a new password from a valid reset
// token; returns a fresh session (auto sign-in).
import { NextResponse } from "next/server";
import { setPasswordWithResetToken } from "@/lib/memberAuthServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const r = await setPasswordWithResetToken(String(b?.token || ""), String(b?.password || ""));
    if (r.error) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, access_token: r.token });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't reset your password. Please try again." }, { status: 500 });
  }
}
