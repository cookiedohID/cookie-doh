// web/app/api/account/birthday/route.ts — a member saves their birthday (MM-DD).
// We store only month-day (no birth year) so the reward recurs and we don't
// collect age. Bound to the logged-in member via customers.auth_user_id.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}
function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  try {
    const supa = supaAdmin();
    const token = bearer(req);
    const { data: u } = token ? await supa.auth.getUser(token) : { data: { user: null } as any };
    const user = u?.user;
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    const b = await req.json().catch(() => ({}));
    const birthday = String(b?.birthday || "").trim();
    if (!birthday) return NextResponse.json({ ok: false, error: "Add your birthday (MM-DD)." }, { status: 400 });
    if (!/^\d{2}-\d{2}$/.test(birthday)) return NextResponse.json({ ok: false, error: "Use MM-DD." }, { status: 400 });
    const [mm, dd] = birthday.split("-").map(Number);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return NextResponse.json({ ok: false, error: "Not a real date." }, { status: 400 });

    // SET-ONCE LOCK: a birthday can only be set while it's empty. Once saved it
    // can't be changed — otherwise a customer could edit it every month to farm
    // the birthday reward. (The owner can correct a genuine mistake in admin.)
    const { data: existing } = await supa
      .from("customers").select("birthday").eq("auth_user_id", user.id).limit(1);
    const current = existing?.[0]?.birthday;
    if (current) {
      return NextResponse.json(
        { ok: false, locked: true, birthday: current, error: "Your birthday is already saved and can't be changed. Message us if it needs fixing." },
        { status: 409 }
      );
    }

    const { error } = await supa.from("customers").update({ birthday }).eq("auth_user_id", user.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, birthday, locked: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 400 });
  }
}
