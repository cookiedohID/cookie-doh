// web/app/api/subscriptions/reward/route.ts
// Reserve / release a subscription reward cookie for the member's NEXT box.
// AUTH REQUIRED; ownership enforced. Reserving draws down the shared reward pool
// (subscriptionRewardBalance) so it can't also be spent at checkout.
//   POST { subscription_id, action:"reserve", flavour_id }
//   POST { subscription_id, action:"release", index }   // remove a queued reward
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMember } from "@/lib/memberServer";
import { subscriptionRewardBalance } from "@/lib/subscriptionRewards";
import { FLAVORS } from "@/lib/catalog";

export const runtime = "nodejs";

const COOKIE = new Map(FLAVORS.filter((f: any) => !f.soldOut).map((f: any) => [String(f.id), f.name]));

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
    const id = String(body?.subscription_id || "").trim();
    const action = String(body?.action || "reserve");
    if (!id) return NextResponse.json({ ok: false, error: "Missing subscription_id" }, { status: 400 });

    const { data: sub } = await supabase.from("subscriptions").select("*").eq("id", id).maybeSingle();
    if (!sub) return NextResponse.json({ ok: false, error: "Subscription not found" }, { status: 404 });
    const owns = sub.auth_user_id === member.user.id || (member.ownerPhone && sub.owner_phone === member.ownerPhone);
    if (!owns) return NextResponse.json({ ok: false, error: "Not your subscription" }, { status: 403 });

    const pending: any[] = Array.isArray(sub.pending_rewards) ? [...sub.pending_rewards] : [];

    if (action === "release") {
      const index = Math.floor(Number(body?.index));
      if (!(index >= 0 && index < pending.length)) {
        return NextResponse.json({ ok: false, error: "Nothing to release." }, { status: 400 });
      }
      pending.splice(index, 1);
      await supabase.from("subscriptions").update({ pending_rewards: pending, updated_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ ok: true });
    }

    // reserve
    const flavourId = String(body?.flavour_id || "").trim();
    if (!COOKIE.has(flavourId)) return NextResponse.json({ ok: false, error: "Pick an available cookie flavour." }, { status: 400 });

    // Must have an available reward (earned − redeemed − already-reserved).
    const bal = await subscriptionRewardBalance(supabase, member.ownerPhone);
    if (bal.available <= 0) {
      return NextResponse.json({ ok: false, error: "No reward cookies available yet — they unlock 1 for every 6 cookies." }, { status: 400 });
    }

    pending.push({ id: flavourId, name: COOKIE.get(flavourId) });
    await supabase.from("subscriptions").update({ pending_rewards: pending, updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[subscriptions/reward] error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 400 });
  }
}
