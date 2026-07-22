// web/lib/memberSession.ts — self-hosted member session, the P3 replacement for
// Supabase Auth's token issuance + verification.
//
// It issues + verifies a signed JWT and returns a user object in the EXACT SHAPE
// Supabase returned — { id, email, user_metadata: { name, phone } } — so that
// lib/memberServer.ts (getUser/phoneFromUser/getMember) and the ~12 route call
// sites doing `supaAdmin().auth.getUser(token)` keep working UNCHANGED once the
// hybrid supaAdmin's `.auth` is pointed here at cutover.
//
// HS256 with AUTH_SESSION_SECRET (≥32 chars). The client stores the token like
// Supabase did and sends it as `Authorization: Bearer <token>`.
import { SignJWT, jwtVerify } from "jose";

const ISSUER = "cookiedoh";
const AUD = "cookiedoh-member";
const DEFAULT_MAX_AGE_SEC = 30 * 24 * 3600; // 30 days, matching the old session feel

function secret(): Uint8Array {
  const s = process.env.AUTH_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SESSION_SECRET missing or <32 chars");
  return new TextEncoder().encode(s);
}

export type SessionUser = {
  id: string;
  email: string | null;
  user_metadata: { name: string | null; phone: string | null };
};

/** Sign a session token for a member. */
export async function issueSession(u: SessionUser, maxAgeSec = DEFAULT_MAX_AGE_SEC): Promise<string> {
  return new SignJWT({
    email: u.email || undefined,
    name: u.user_metadata?.name || undefined,
    phone: u.user_metadata?.phone || undefined,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(u.id)
    .setIssuer(ISSUER)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + maxAgeSec)
    .sign(secret());
}

const RESET_AUD = "cookiedoh-reset";

/** Short-lived (30 min) password-reset token — emailed as a link, single purpose. */
export async function issueResetToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(RESET_AUD)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 30 * 60)
    .sign(secret());
}

/** Verify a reset token → userId, or null. Never throws. */
export async function verifyResetToken(token: string | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER, audience: RESET_AUD });
    return payload.sub ? String(payload.sub) : null;
  } catch {
    return null;
  }
}

/** Verify a session token → Supabase-shaped user, or null. Never throws. */
export async function verifySession(token: string | null): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER, audience: AUD });
    if (!payload.sub) return null;
    return {
      id: String(payload.sub),
      email: (payload.email as string) || null,
      user_metadata: { name: (payload.name as string) || null, phone: (payload.phone as string) || null },
    };
  } catch {
    return null;
  }
}
