// web/lib/googleAuth.ts — verify a Google ID token (from Google Identity Services
// on the client) against Google's public keys, and only accept tokens minted for
// OUR OAuth client. Replaces Supabase's hosted Google OAuth. No secret needed to
// verify — just the public client id (audience check).
import { jwtVerify, createRemoteJWKSet } from "jose";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export type GoogleIdentity = { sub: string; email: string | null; name: string | null; emailVerified: boolean };

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity | null> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return null; // misconfig — never accept unverifiable-audience tokens
  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    if (!payload.sub) return null;
    return {
      sub: String(payload.sub),
      email: (payload.email as string) || null,
      name: (payload.name as string) || null,
      emailVerified: payload.email_verified === true,
    };
  } catch {
    return null;
  }
}
