// web/app/api/subscriptions/manage/route.ts
// One POST endpoint for member subscription actions: skip | pause | resume |
// cancel | edit. AUTH REQUIRED; ownership is verified before any mutation.
// (Renew is a fresh payment via /api/subscriptions/checkout with renew_subscription_id.)
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMember } from "@/lib/memberServer";
import { skipNext, pause, resume, cancel, editConfig } from "@/lib/subscriptionManage";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const supabase = supaAdmin();
    const member = await getMember(supabase, req);
    if (!member) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const id = String(body?.subscription_id || "").trim();
    if (!id) return NextResponse.json({ ok: false, error: "Missing subscription_id" }, { status: 400 });

    const { data: sub } = await supabase.from("subscriptions").select("*").eq("id", id).maybeSingle();
    if (!sub) return NextResponse.json({ ok: false, error: "Subscription not found" }, { status: 404 });

    // Ownership: the caller's auth id OR their server-verified phone.
    const owns = sub.auth_user_id === member.user.id || (member.ownerPhone && sub.owner_phone === member.ownerPhone);
    if (!owns) return NextResponse.json({ ok: false, error: "Not your subscription" }, { status: 403 });

    let r;
    switch (action) {
      case "skip": r = await skipNext(supabase, sub); break;
      case "pause": r = await pause(supabase, sub); break;
      case "resume": r = await resume(supabase, sub); break;
      case "cancel": r = await cancel(supabase, sub); break;
      case "edit": r = await editConfig(supabase, sub, body); break;
      default: return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    }

    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status || 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[subscriptions/manage] error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Action failed" }, { status: 400 });
  }
}
