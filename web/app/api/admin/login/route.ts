// web/app/api/admin/login/route.ts — admin sign in / out.
// POST { password } → sets an httpOnly cookie if it matches ADMIN_PASSWORD.
// DELETE → clears it (log out). The cookie value matches middleware.ts.
import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

const COOKIE = "cd_admin";
const token = (password: string) =>
  crypto.createHash("sha256").update(`cookie-doh::${password}`).digest("hex");

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const password = String(body?.password || "");
  const expected = process.env.ADMIN_BASIC_PASS || process.env.ADMIN_PASSWORD || "";

  if (!expected) {
    return NextResponse.json({ ok: false, error: "Admin password isn't set yet (ADMIN_BASIC_PASS)." }, { status: 503 });
  }
  // Constant-time compare.
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!match) {
    return NextResponse.json({ ok: false, error: "Wrong password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
