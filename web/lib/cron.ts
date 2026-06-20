// web/lib/cron.ts — shared helpers for secret-protected cron endpoints.
import { createClient } from "@supabase/supabase-js";

// Secret = CRON_SECRET (preferred) or ADMIN_RETRY_SECRET (fallback). With neither
// set the cron is disabled — endpoints return 404 rather than running open.
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.ADMIN_RETRY_SECRET || "";
  if (!secret) return false;
  const url = new URL(req.url);
  const provided =
    req.headers.get("x-cron-key") ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("key");
  return !!provided && provided === secret;
}

export function supaService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}
