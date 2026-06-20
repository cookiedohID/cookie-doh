// web/lib/referrals.ts — referral program: capture, qualification, rewards.
//
// Loop: a member shares /?ref=<memberCode>. A friend lands, the code rides along
// in the `cd_ref` cookie, and is stored on their order. When that order is PAID,
// the payment webhook calls tryQualifyReferral(): if the friend is brand new and
// the order is worth at least a box of 6, both sides get +1 free cookie (a row in
// loyalty_grants). UNIQUE(referred_phone) makes the whole thing idempotent.
import { canonicalPhone, phoneSignificant } from "@/lib/phone";
import { BOX_PRICES } from "@/lib/catalog";

const MIN_QUALIFYING_TOTAL = BOX_PRICES[6]; // "at least a box of 6" → Rp180,000

export function referralLink(memberCode: string, origin?: string): string {
  const base = (origin || process.env.NEXT_PUBLIC_SITE_URL || "https://www.cookiedoh.co.id").replace(/\/$/, "");
  return `${base}/?ref=${encodeURIComponent(memberCode)}`;
}

// Sanitize a referral code coming from a cookie/URL before we trust it.
export function cleanRefCode(raw: any): string | null {
  const s = String(raw || "").trim();
  return /^CD[0-9A-Za-z]{2,24}$/.test(s) ? s : null;
}

export type ReferralResult = {
  qualified: boolean;
  reason?: string;
  referrerPhone?: string;
  friendPhone?: string;
};

// Called from the Midtrans webhook on a PAID order. Never throws.
export async function tryQualifyReferral(supa: any, order: any): Promise<ReferralResult> {
  try {
    const refCode = cleanRefCode(order?.meta?.ref);
    if (!refCode) return { qualified: false, reason: "no ref" };

    const friendPhone = canonicalPhone(order?.customer_phone);
    const friendSig = phoneSignificant(order?.customer_phone);
    if (!friendPhone || !friendSig) return { qualified: false, reason: "no friend phone" };

    // Must be worth at least a box of 6 IN MERCHANDISE — use the subtotal, which
    // excludes shipping (and Rp0 free/redeemed lines), so a small order padded by
    // delivery fees can't qualify. Fall back to total for legacy rows.
    const merchSpend = Number(order?.subtotal_idr || order?.total_idr || 0);
    if (merchSpend < MIN_QUALIFYING_TOTAL) return { qualified: false, reason: "below min spend" };

    // Resolve the referrer by their member code.
    const { data: refCust } = await supa
      .from("customers")
      .select("phone, member_code")
      .eq("member_code", refCode)
      .maybeSingle();
    const referrerPhone = canonicalPhone(refCust?.phone);
    const referrerSig = phoneSignificant(refCust?.phone);
    if (!referrerPhone || !referrerSig) return { qualified: false, reason: "referrer not found" };

    // No self-referral.
    if (referrerSig === friendSig) return { qualified: false, reason: "self-referral" };

    // The friend must be NEW: this order is their first PAID one.
    const { data: priorOrders } = await supa
      .from("orders")
      .select("id, customer_phone, payment_status")
      .eq("payment_status", "PAID")
      .ilike("customer_phone", `%${friendSig}%`)
      .limit(50);
    const priorPaid = (priorOrders || []).filter(
      (o: any) => phoneSignificant(o?.customer_phone) === friendSig && o?.id !== order?.id
    );
    if (priorPaid.length > 0) return { qualified: false, reason: "not first order" };

    // Claim the referral. UNIQUE(referred_phone) → a retry/2nd order can't double-grant.
    const { data: refRow, error: refErr } = await supa
      .from("referrals")
      .insert({
        referrer_phone: referrerPhone,
        referrer_code: refCode,
        referred_phone: friendPhone,
        order_id: order?.id || null,
        status: "qualified",
      })
      .select("id")
      .maybeSingle();
    if (refErr || !refRow?.id) return { qualified: false, reason: "already referred" };

    // Grant +1 free cookie each (single atomic insert; UNIQUE(reason, ref) keeps
    // it idempotent). If the grant write fails, roll back the claim so (a) we don't
    // WhatsApp a cookie we didn't actually grant, and (b) the next webhook retry can
    // re-attempt cleanly instead of being blocked by the UNIQUE(referred_phone) row.
    const { error: grantErr } = await supa.from("loyalty_grants").insert([
      { phone: referrerPhone, cookies: 1, drinks: 0, reason: "referral_referrer", ref: refRow.id, order_id: order?.id || null },
      { phone: friendPhone, cookies: 1, drinks: 0, reason: "referral_friend", ref: refRow.id, order_id: order?.id || null },
    ]);
    if (grantErr) {
      await supa.from("referrals").delete().eq("id", refRow.id);
      return { qualified: false, reason: "grant write failed" };
    }

    return { qualified: true, referrerPhone, friendPhone };
  } catch (e: any) {
    return { qualified: false, reason: e?.message || "error" };
  }
}
