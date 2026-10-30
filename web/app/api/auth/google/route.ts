// web/app/api/auth/google/route.ts — Google ID token (from Google Identity
// Services on the client) → memberSession token.
import { NextResponse } from "next/server";
import { loginWithGoogle } from "@/lib/memberAuthServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const r = await loginWithGoogle(String(b?.id_token || b?.credential || ""));
    if (r.error) return NextResponse.json({ ok: false, error: r.error }, { status: 401 });
    return NextResponse.json({ ok: true, access_token: r.token });
  } catch {
    return NextResponse.json({ ok: false, error: "Google sign-in failed. Please try again." }, { status: 500 });
  }
}
