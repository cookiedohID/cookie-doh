// web/app/api/account/password/route.ts — set or change the signed-in member's
// password. Identity comes from the session (Bearer token), so a Google-only
// account can set a FIRST password here (the "forgot password" flow can't — there's
// nothing to reset). Changing an existing password requires the current one.
// Returns a fresh session token, because the change bumps token_version (which
// would otherwise log the caller out of this very session).
import { NextResponse } from "next/server";
import { supaAdmin } from "@/lib/supaAdmin";
import { getUser, bearer } from "@/lib/memberServer";
import { setMemberPassword } from "@/lib/memberAuthServer";
import { throttleAuth } from "@/lib/authThrottle";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const supa = supaAdmin();
    const user = await getUser(supa, bearer(req));
    if (!user) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
    const throttled = await throttleAuth(req, "set-password", user.id, { ipMax: 20, idMax: 10 });
    if (throttled) return NextResponse.json({ ok: false, error: throttled }, { status: 429 });
    const b = await req.json().catch(() => ({}));
    const r = await setMemberPassword(
      user.id,
      String(b?.password || ""),
      b?.currentPassword != null ? String(b.currentPassword) : undefined,
    );
    if (r.error) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, token: r.token });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't update your password. Please try again." }, { status: 500 });
  }
}
