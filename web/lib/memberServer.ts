// web/lib/memberServer.ts — server-side member identity from a request.
// Single source of truth for "who is this logged-in member, and what verified
// phone do they own" — used by every subscription member route. The phone is
// ALWAYS derived from server state (auth metadata or an OTP-verified binding),
// never from the request body.
import { canonicalPhone } from "@/lib/phone";

export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
}

export async function getUser(supa: any, token: string | null) {
  if (!token) return null;
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export function phoneFromUser(user: any): string | null {
  const p = user?.user_metadata?.phone || user?.phone || null;
  return p ? canonicalPhone(String(p)) : null;
}

// The phone OTP-bound to THIS user (same rule as /api/account/me).
export async function boundPhoneForUser(supa: any, userId: string): Promise<string | null> {
  const { data: custRows } = await supa
    .from("customers").select("phone, phone_verified").eq("auth_user_id", userId).limit(1);
  const cust = custRows?.[0];
  if (cust?.phone && cust.phone_verified) return canonicalPhone(String(cust.phone));
  const { data: otpRows } = await supa
    .from("phone_otps").select("phone").eq("auth_user_id", userId).eq("verified", true).limit(1);
  const otp = otpRows?.[0];
  if (otp?.phone) return canonicalPhone(String(otp.phone));
  return null;
}

export type Member = { user: any; ownerPhone: string | null };

// Returns null when not signed in. ownerPhone may be null if the user has no
// verified phone yet (caller decides whether that's allowed).
export async function getMember(supa: any, req: Request): Promise<Member | null> {
  const user = await getUser(supa, bearer(req));
  if (!user) return null;
  const ownerPhone = phoneFromUser(user) || (await boundPhoneForUser(supa, user.id));
  return { user, ownerPhone };
}
