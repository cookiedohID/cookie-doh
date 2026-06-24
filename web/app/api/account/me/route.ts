// web/app/api/account/me/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canonicalPhone, phoneSignificant } from "@/lib/phone";
import { loyaltyFromOrders } from "@/lib/loyalty";
import { grantsForPhone } from "@/lib/loyaltyGrants";
import { subscriptionRewardBalance } from "@/lib/subscriptionRewards";

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

// Verify the access token -> the logged-in user.
async function getUser(supa: any, token: string | null) {
  if (!token) return null;
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

function memberCodeFor(phone: string) {
  const sig = phoneSignificant(phone) || "";
  return "CD" + sig.slice(-8); // e.g. CD81932181818 -> CD32181818
}

// Collision-safe member code. The short "CD"+last-8 code can collide when two
// numbers share their last 8 local digits, and customers.member_code is UNIQUE —
// so the second member's write used to silently fail (no QR). Resolution:
//   1. Reuse this phone's existing code if it already has one (keeps printed QRs stable).
//   2. Otherwise use the short code, unless another phone already holds it.
//   3. On collision, fall back to "CD"+FULL significant digits, which is unique by
//      construction (each canonical phone is unique and >8 digits, so it can never
//      equal another number's last-8 code either).
async function resolveMemberCode(supa: any, phone: string): Promise<string> {
  const sig = phoneSignificant(phone) || "";
  const { data: mine } = await supa
    .from("customers")
    .select("member_code")
    .eq("phone", phone)
    .maybeSingle();
  if (mine?.member_code) return mine.member_code;

  const base = memberCodeFor(phone);
  const { data: clash } = await supa
    .from("customers")
    .select("phone")
    .eq("member_code", base)
    .maybeSingle();
  if (!clash || clash.phone === phone) return base;

  return "CD" + sig; // always-unique fallback
}

// Phone from the user's metadata (set at signup, or when a Google user adds it).
function phoneFromUser(user: any): string | null {
  const meta = user?.user_metadata?.phone;
  return meta ? canonicalPhone(String(meta)) : null;
}

type MemberResult =
  | { kind: "member"; member: { name: string | null; phone: string; memberCode: string; birthday: string | null; loyalty: ReturnType<typeof loyaltyFromOrders>; subReward: Awaited<ReturnType<typeof subscriptionRewardBalance>> } }
  | { kind: "ownedByOther" }
  | { kind: "needsVerify"; phone: string };

async function buildMember(supa: any, user: any, phone: string): Promise<MemberResult> {
  // Fetch the three independent things in PARALLEL (this is the main speed-up —
  // these used to run one after another, plus a write, on every page load):
  //   (a) the customer row — ownership guard + tells us if a write is even needed
  //   (b) the phone OTP    — possession guard
  //   (c) the order history — used to compute loyalty below
  const selectCols = "id, phone, name, email, member_code, auth_user_id, cookies_redeemed, drinks_redeemed, birthday";
  const sig = phoneSignificant(phone);
  const [custRes, otpRes, ordersRes] = await Promise.all([
    supa.from("customers").select(selectCols).eq("phone", phone).maybeSingle(),
    supa.from("phone_otps").select("verified, auth_user_id, expires_at").eq("phone", phone).maybeSingle(),
    sig
      ? supa.from("orders").select("payment_status, items_json, customer_phone").ilike("customer_phone", `%${sig}%`).limit(500)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const existing: any = custRes.data;
  const otp: any = otpRes.data;

  // 1) Ownership guard: NEVER reassign a phone already linked to another account.
  if (existing?.auth_user_id && existing.auth_user_id !== user.id) {
    return { kind: "ownedByOther" };
  }

  // 2) Possession guard: the phone must have been verified via WhatsApp OTP. A
  //    null-auth_user_id OTP (verified at signup before the account existed) is
  //    only claimable while still fresh; once bound, only that user may claim it.
  const otpFresh = otp?.expires_at ? new Date(otp.expires_at).getTime() > Date.now() : false;
  const phoneVerified =
    Boolean(otp?.verified) &&
    (otp?.auth_user_id === user.id || (otp?.auth_user_id == null && otpFresh));
  if (!phoneVerified) {
    return { kind: "needsVerify", phone };
  }

  // 3) Link/refresh the customer — but SKIP the write entirely when the record is
  //    already correctly bound to this user (the common repeat-load case). The
  //    per-load write was the main reason /account felt slow.
  const name = user?.user_metadata?.name || null;
  let cust: any = existing;
  const alreadyBound = Boolean(existing && existing.auth_user_id === user.id && existing.member_code);
  if (!alreadyBound) {
    let code = await resolveMemberCode(supa, phone);
    const upsertRow = (memberCode: string) => ({
      phone,
      auth_user_id: user.id,
      member_code: memberCode,
      ...(name ? { name } : {}),
      ...(user?.email ? { email: user.email } : {}),
      phone_verified: true,
      updated_at: new Date().toISOString(),
    });
    let { data: row, error: upErr } = await supa
      .from("customers")
      .upsert(upsertRow(code), { onConflict: "phone" })
      .select(selectCols)
      .maybeSingle();
    if (upErr && /member_code/i.test(upErr.message || "")) {
      code = "CD" + (phoneSignificant(phone) || "");
      ({ data: row } = await supa
        .from("customers")
        .upsert(upsertRow(code), { onConflict: "phone" })
        .select(selectCols)
        .maybeSingle());
    }
    cust = row || existing;
    // Bind this verified phone to the user so a later claimant can't grab it.
    if (otp?.auth_user_id == null) {
      await supa.from("phone_otps").update({ auth_user_id: user.id }).eq("phone", phone).is("auth_user_id", null);
    }
  }

  // Loyalty from the paid orders we already fetched (exact canonical match — the
  // ilike above is only a loose prefilter).
  const orders = sig ? (ordersRes.data || []).filter((o: any) => phoneSignificant(o?.customer_phone) === sig) : [];
  const grant = await grantsForPhone(supa, phone);
  const loyalty = loyaltyFromOrders(orders, grant);
  // Separate redeemable subscription reward pool (buy 6, get 1 free).
  const subReward = await subscriptionRewardBalance(supa, phone);

  return {
    kind: "member",
    member: {
      name: cust?.name || name,
      phone,
      memberCode: cust?.member_code || memberCodeFor(phone),
      birthday: cust?.birthday ?? null,
      loyalty,
      subReward,
    },
  };
}

// When the auth user's metadata has no phone, recover a phone ALREADY BOUND to
// this exact auth user from the authoritative tables. Keyed strictly on the
// server-derived user.id (never a client-supplied phone), and only on rows already
// bound to this user — so it can't claim someone else's number. This fixes the
// redundant re-prompt: a fully verified+bound member whose user_metadata.phone was
// never written (e.g. the first /account load was interrupted) was being asked to
// "add your phone" again even though the binding exists in the DB.
async function boundPhoneForUser(supa: any, userId: string): Promise<string | null> {
  const { data: custRows } = await supa
    .from("customers")
    .select("phone, phone_verified")
    .eq("auth_user_id", userId)
    .limit(1);
  const cust = custRows?.[0];
  if (cust?.phone && cust.phone_verified) return canonicalPhone(String(cust.phone));

  const { data: otpRows } = await supa
    .from("phone_otps")
    .select("phone")
    .eq("auth_user_id", userId)
    .eq("verified", true)
    .limit(1);
  const otp = otpRows?.[0];
  if (otp?.phone) return canonicalPhone(String(otp.phone));

  return null;
}

export async function GET(req: Request) {
  try {
    const supa = supaAdmin();
    const user = await getUser(supa, bearer(req));
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    let phone = phoneFromUser(user);
    let recovered = false;
    if (!phone) {
      // Metadata has no phone — before asking again, recover one already bound to
      // THIS user in the DB (the genuine-redundant-prompt case).
      phone = await boundPhoneForUser(supa, user.id);
      recovered = Boolean(phone);
    }
    if (!phone) {
      // Genuinely no phone on file (e.g. a fresh Google user) — ask them to add one.
      return NextResponse.json({ ok: true, needsPhone: true, email: user.email || null });
    }
    const r = await buildMember(supa, user, phone);
    if (r.kind === "ownedByOther") {
      return NextResponse.json({ ok: false, error: "This phone is already linked to another account." }, { status: 409 });
    }
    if (r.kind === "needsVerify") {
      // Phone on file but not OTP-verified (e.g. a legacy/Google link) — re-verify.
      return NextResponse.json({ ok: true, needsPhone: true, needsVerify: true, phone: r.phone, email: user.email || null });
    }
    // Self-heal: if we recovered the phone from the DB (metadata was empty), persist
    // it onto the auth user so future loads resolve instantly without the fallback.
    if (recovered) {
      try {
        await supa.auth.admin.updateUserById(user.id, {
          user_metadata: { ...(user.user_metadata || {}), phone },
        });
      } catch {
        /* non-fatal — the DB fallback still resolves it next time */
      }
    }
    return NextResponse.json({ ok: true, member: r.member });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}

// Set the phone (Google users completing their profile). Requires the phone to
// have been verified via WhatsApp OTP first — see /api/account/otp/verify.
export async function POST(req: Request) {
  try {
    const supa = supaAdmin();
    const user = await getUser(supa, bearer(req));
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const phone = canonicalPhone(body?.phone);
    if (!phone) return NextResponse.json({ ok: false, error: "Enter a valid phone." }, { status: 400 });

    const r = await buildMember(supa, user, phone);
    if (r.kind === "ownedByOther") {
      return NextResponse.json({ ok: false, error: "This phone is already linked to another account." }, { status: 409 });
    }
    if (r.kind === "needsVerify") {
      return NextResponse.json({ ok: false, needsVerify: true, error: "Verify this number on WhatsApp first." }, { status: 400 });
    }

    // Only now (verified + linked) persist the phone on the auth user so future
    // logins resolve it.
    await supa.auth.admin.updateUserById(user.id, {
      user_metadata: { ...(user.user_metadata || {}), phone },
    });

    return NextResponse.json({ ok: true, member: r.member });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
