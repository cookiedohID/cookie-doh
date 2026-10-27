// web/lib/supaAdmin.ts — the ONE service-side client factory for the Cloud SQL
// migration. Replaces the ~64 per-route `supaAdmin()` copies that each built a
// Supabase service client. Returns a HYBRID:
//   • .from() / .rpc()  → Cloud SQL via the pg shim (lib/pgClient)  ← data moved
//   • .auth             → Supabase, unchanged                       ← until P3
// So every route swaps identically (`import { supaAdmin } from "@/lib/supaAdmin"`)
// and keeps working: its data queries run on Postgres, its member-token checks
// still run on Supabase Auth. P3 replaces the auth half and drops Supabase.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pgClient } from "@/lib/pgClient";
import { verifySession } from "@/lib/memberSession";

// Supabase client used ONLY for auth (auth.getUser / auth.admin.*) during P1/P2.
let _authClient: SupabaseClient | null = null;
function supabaseAuthClient(): SupabaseClient {
  if (_authClient) return _authClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  _authClient = createClient(url, key, { auth: { persistSession: false } });
  return _authClient;
}

// P3: self-hosted auth shim, shaped like the tiny slice of the Supabase auth API
// the app uses — getUser(token) verifies a memberSession JWT; admin.updateUserById
// patches auth_user (the app only ever sets user_metadata.phone/name). Returns the
// SAME { data:{user}, error } shape, so memberServer + the 12 call sites are unchanged.
function selfHostedAuth(pg: ReturnType<typeof pgClient>) {
  return {
    async getUser(token?: string) {
      const user = await verifySession(token || null);
      if (!user) return { data: { user: null }, error: { message: "invalid or expired token" } };
      // Revocation: reject if the account's token_version moved past the token's
      // (password reset / sign-out-everywhere). Fail-open on a DB blip — the JWT
      // signature already passed, so this is a secondary control.
      try {
        const { data } = await pg.from("auth_user").select("token_version").eq("id", user.id).limit(1);
        const currentTv = Number(data?.[0]?.token_version ?? 0);
        if (data?.[0] && currentTv !== (user as any)._tv) {
          return { data: { user: null }, error: { message: "session revoked" } };
        }
      } catch { /* fail-open */ }
      const { _tv, ...clean } = user as any;
      return { data: { user: clean }, error: null };
    },
    admin: {
      async updateUserById(id: string, attrs: any) {
        const md = attrs?.user_metadata || {};
        const patch: any = { updated_at: new Date().toISOString() };
        if (md.phone !== undefined) patch.phone = md.phone;
        if (md.name !== undefined) patch.name = md.name;
        if (attrs?.password) {
          patch.password_hash = await (await import("bcryptjs")).default.hash(String(attrs.password), 10);
          // any password change invalidates outstanding sessions/reset tokens
          const { data } = await pg.from("auth_user").select("token_version").eq("id", id).limit(1);
          patch.token_version = Number(data?.[0]?.token_version ?? 0) + 1;
        }
        const { error } = await pg.from("auth_user").update(patch).eq("id", id);
        return { data: { user: { id } }, error };
      },
    },
  };
}

// `any` return keeps the ~300 existing call sites (.from().select().eq()… and
// .auth.getUser()) type-checking unchanged during the migration.
//
// AUTH_SELFHOSTED=1 flips `.auth` from Supabase → the self-hosted shim. It MUST be
// flipped together with the client (which then issues memberSession tokens) — a
// half-flip would reject the other side's tokens and log everyone out. Off = old
// Supabase auth, unchanged.
export function supaAdmin(): any {
  const pg = pgClient();
  return {
    from: pg.from.bind(pg),
    rpc: pg.rpc.bind(pg),
    get auth() {
      return process.env.AUTH_SELFHOSTED === "1" ? selfHostedAuth(pg) : supabaseAuthClient().auth;
    },
  };
}
