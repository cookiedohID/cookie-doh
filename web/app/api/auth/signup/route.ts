// web/app/api/auth/signup/route.ts — create an email+password member → session token.
import { NextResponse } from "next/server";
import { signupWithPassword } from "@/lib/memberAuthServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const r = await signupWithPassword(
      String(b?.email || ""), String(b?.password || ""), String(b?.name || ""), String(b?.phone || ""),
    );
    if (r.error) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, access_token: r.token });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't create your account. Please try again." }, { status: 500 });
  }
}
