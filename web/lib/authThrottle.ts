// web/lib/authThrottle.ts — lightweight DB-backed fixed-window rate limiter for
// the self-hosted auth routes (brute-force / credential-stuffing / reset-spam).
// Shared across serverless instances via the auth_throttle table. Fail-OPEN on a
// DB error (never lock out real users because of a DB blip) — it's a throttle,
// not the auth gate.
import { supaAdmin } from "@/lib/supaAdmin";

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  return (xff.split(",")[0] || req.headers.get("x-real-ip") || "unknown").trim();
}

/** Register one attempt on `bucket`. Returns true if allowed, false if over `max`
 *  within the `windowSec` window. */
export async function allowAttempt(bucket: string, max: number, windowSec: number): Promise<boolean> {
  try {
    const supa = supaAdmin();
    const now = Date.now();
    const { data } = await supa.from("auth_throttle").select("hits, reset_at").eq("bucket", bucket).limit(1);
    const row = data?.[0];
    if (!row || new Date(row.reset_at).getTime() < now) {
      await supa.from("auth_throttle").upsert({ bucket, hits: 1, reset_at: new Date(now + windowSec * 1000).toISOString() }, { onConflict: "bucket" });
      return true;
    }
    if (Number(row.hits) >= max) return false;
    await supa.from("auth_throttle").update({ hits: Number(row.hits) + 1 }).eq("bucket", bucket);
    return true;
  } catch {
    return true; // fail-open
  }
}

/** Check IP + (optional) identity buckets for an auth endpoint. Returns null if
 *  allowed, or a message if throttled. */
export async function throttleAuth(req: Request, action: string, identity?: string, opts?: { ipMax?: number; idMax?: number; windowSec?: number }): Promise<string | null> {
  const windowSec = opts?.windowSec ?? 15 * 60;
  const ipOk = await allowAttempt(`${action}:ip:${clientIp(req)}`, opts?.ipMax ?? 30, windowSec);
  const idOk = identity ? await allowAttempt(`${action}:id:${identity.toLowerCase().trim()}`, opts?.idMax ?? 8, windowSec) : true;
  return ipOk && idOk ? null : "Too many attempts. Please wait a few minutes and try again.";
}
