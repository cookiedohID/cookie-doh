// web/app/api/subscriptions/me/route.ts
// The signed-in member's subscriptions (config + plans + upcoming boxes +
// remaining prepaid capacity). AUTH REQUIRED; scoped to subscriptions the caller
// OWNS (auth_user_id == caller, OR owner_phone == their OTP-verified phone). No
// unauthenticated phone-lookup path.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMember } from "@/lib/memberServer";
import { remainingCapacity } from "@/lib/subscriptionManage";
import { subscriptionRewardBalance } from "@/lib/subscriptionRewards";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    const supabase = supaAdmin();
    const member = await getMember(supabase, req);
    if (!member) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    // Own by auth id OR verified phone. Build an OR filter only with values we have.
    const ors: string[] = [`auth_user_id.eq.${member.user.id}`];
    if (member.ownerPhone) ors.push(`owner_phone.eq.${member.ownerPhone}`);

    const { data: subs } = await supabase
      .from("subscriptions")
      .select("*")
      .or(ors.join(","))
      .neq("status", "pending_payment") // hide not-yet-paid shells
      .order("created_at", { ascending: false });

    const out = [];
    for (const sub of subs || []) {
      const { data: plans } = await supabase
        .from("subscription_plans")
        .select("id, boxes_total, boxes_used, amount_idr, payment_status, paid_at, created_at")
        .eq("subscription_id", sub.id)
        .order("created_at", { ascending: false });

      const { data: upcoming } = await supabase
        .from("subscription_deliveries")
        .select("id, seq, scheduled_for, status, order_no")
        .eq("subscription_id", sub.id)
        .in("status", ["scheduled", "made", "delivered"])
        .order("scheduled_for", { ascending: true })
        .limit(8);

      // Subscription reward tracker (separate from the buy-10-get-1 loyalty):
      // cookies actually received so far + free cookies earned at 1-per-6.
      const { count: madeCount } = await supabase
        .from("subscription_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("subscription_id", sub.id)
        .in("status", ["made", "delivered"]);
      const cookiesPurchased = (madeCount || 0) * Number(sub.box_size);
      const rewardCookies = Math.floor(cookiesPurchased / 6);

      out.push({
        ...sub,
        plans: plans || [],
        upcoming: upcoming || [],
        remaining: await remainingCapacity(supabase, sub.id),
        cookiesPurchased,
        rewardCookies,
      });
    }

    // The member's redeemable reward pool (shared across their subscriptions).
    const reward = await subscriptionRewardBalance(supabase, member.ownerPhone);

    return NextResponse.json({ ok: true, subscriptions: out, reward, needsPhone: !member.ownerPhone });
  } catch (e: any) {
    console.error("[subscriptions/me] error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Failed to load" }, { status: 500 });
  }
}
