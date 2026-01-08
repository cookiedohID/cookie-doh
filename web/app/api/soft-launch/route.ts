import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(req: NextRequest) {
  try {
    const enabled = String(process.env.SOFT_LAUNCH_ENABLED ?? "").toLowerCase() === "true";
    if (!enabled) {
      return NextResponse.json({ ok: true, bypass: true }, { status: 200 });
    }

    const expected = getEnv("SOFT_LAUNCH_PASS");
    const body = await req.json();

    const pass = String(body?.pass ?? "").trim();
    const nextPath = String(body?.next ?? "/").trim();

    if (!pass || pass !== expected) {
      return NextResponse.json({ ok: false, error: "Wrong password" }, { status: 401 });
    }

    // only allow internal paths
    const safeNext = nextPath.startsWith("/") ? nextPath : "/";

    const res = NextResponse.json({ ok: true, next: safeNext }, { status: 200 });
    res.cookies.set("cd_softlaunch", "1", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
