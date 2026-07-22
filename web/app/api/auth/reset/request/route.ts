// web/app/api/auth/reset/request/route.ts — email a password-reset link. Always
// returns ok (never reveals whether the email exists).
import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/memberAuthServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    await requestPasswordReset(String(b?.email || ""));
  } catch { /* always silent */ }
  return NextResponse.json({ ok: true });
}
