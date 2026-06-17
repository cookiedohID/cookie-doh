// web/app/api/account/me/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canonicalPhone, phoneSignificant } from "@/lib/phone";
import { loyaltyFromOrders } from "@/lib/loyalty";

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

// Phone from the user's metadata (set at signup, or when a Google user adds it).
function phoneFromUser(user: any): string | null {
  const meta = user?.user_metadata?.phone;
  return meta ? canonicalPhone(String(meta)) : null;
}

type MemberResult =
  | { kind: "member"; member: { name: string | null; phone: string; memberCode: string; loyalty: ReturnType<typeof loyaltyFromOrders> } }
  | { kind: "ownedByOther" }
  | { kind: "needsVerify"; phone: string };

async function buildMember(supa: any, user: any, phone: string): Promise<MemberResult> {
  // 1) Ownership guard: NEVER reassign a phone already linked to another account.
  //    Without this, any signed-in user could POST a victim's phone and steal
  //    their customer record + loyalty (account takeover).
  const { data: existing } = await supa
    .from("customers")
    .select("auth_user_id")
    .eq("phone", phone)
    .maybeSingle();
  if (existing?.auth_user_id && existing.auth_user_id !== user.id) {
    return { kind: "ownedByOther" };
  }

  // 2) Possession guard: the phone must have been verified via WhatsApp OTP.
  //    At email signup the OTP is verified before the account exists (auth_user_id
  //    null); once a logged-in user binds it, only they may claim it afterwards.
  const { data: otp } = await supa
    .from("phone_otps")
    .select("verified, auth_user_id")
    .eq("phone", phone)
    .maybeSingle();
  const phoneVerified =
    Boolean(otp?.verified) && (otp?.auth_user_id == null || otp.auth_user_id === user.id);
  if (!phoneVerified) {
    return { kind: "needsVerify", phone };
  }

  // 3) Safe to link/refresh the customer record.
  const code = memberCodeFor(phone);
  const name = user?.user_metadata?.name || null;
  const { data: cust } = await supa
    .from("customers")
    .upsert(
      {
        phone,
        auth_user_id: user.id,
        member_code: code,
        ...(name ? { name } : {}),
        ...(user?.email ? { email: user.email } : {}),
        phone_verified: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "phone" }
    )
    .select("id, phone, name, email, member_code, cookies_redeemed, drinks_redeemed")
    .maybeSingle();

  // Loyalty from paid orders matched by phone (exact canonical match — ilike is
  // only a loose prefilter, see /api/loyalty/lookup).
  const sig = phoneSignificant(phone);
  let orders: any[] = [];
  if (sig) {
    const { data } = await supa
      .from("orders")
      .select("payment_status, items_json, customer_phone")
      .ilike("customer_phone", `%${sig}%`)
      .limit(500);
    orders = (data || []).filter((o: any) => phoneSignificant(o?.customer_phone) === sig);
  }
  const loyalty = loyaltyFromOrders(orders);

  return {
    kind: "member",
    member: {
      name: cust?.name || name,
      phone,
      memberCode: cust?.member_code || code,
      loyalty,
    },
  };
}

export async function GET(req: Request) {
  try {
    const supa = supaAdmin();
    const user = await getUser(supa, bearer(req));
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    const phone = phoneFromUser(user);
    if (!phone) {
      // Google users with no phone yet — ask them to add one.
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
