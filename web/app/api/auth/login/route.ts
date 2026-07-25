// web/app/api/auth/login/route.ts — email + password → memberSession token.
import { NextResponse } from "next/server";
import { loginWithPassword } from "@/lib/memberAuthServer";
import { throttleAuth } from "@/lib/authThrottle";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const blocked = await throttleAuth(req, "login", String(b?.email || ""), { ipMax: 40, idMax: 8 });
    if (blocked) return NextResponse.json({ ok: false, error: blocked }, { status: 429 });
    const r = await loginWithPassword(String(b?.email || ""), String(b?.password || ""));
    if (r.error) return NextResponse.json({ ok: false, error: r.error }, { status: 401 });
    return NextResponse.json({ ok: true, access_token: r.token });
  } catch {
    return NextResponse.json({ ok: false, error: "Sign-in failed. Please try again." }, { status: 500 });
  }
}
