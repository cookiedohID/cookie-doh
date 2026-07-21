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

// `any` return keeps the ~300 existing call sites (.from().select().eq()… and
// .auth.getUser()) type-checking unchanged during the migration.
export function supaAdmin(): any {
  const pg = pgClient();
  return {
    from: pg.from.bind(pg),
    rpc: pg.rpc.bind(pg),
    get auth() {
      return supabaseAuthClient().auth;
    },
  };
}
