// web/lib/settings.ts — tiny key-value settings store (app_settings table),
// for numbers the owner tunes in the admin UI instead of env vars.
// Server-only (service-role client passed in). Missing table ⇒ fallback.

export async function getSetting(supa: any, key: string): Promise<string | null> {
  try {
    const { data } = await supa.from("app_settings").select("value").eq("key", key).maybeSingle();
    return data?.value ?? null;
  } catch {
    return null;
  }
}

export async function setSetting(supa: any, key: string, value: string): Promise<boolean> {
  try {
    const { error } = await supa
      .from("app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    return !error;
  } catch {
    return false;
  }
}

// The TBS marketplace fee % (owner-tunable). Priority: explicit override
// (report what-if box) → admin-saved setting → env → 5.
export async function getTbsFeePct(supa: any, override?: string | null): Promise<number> {
  const clamp = (n: number) => Math.min(50, Math.max(0, n));
  const o = Number(override);
  if (override != null && override !== "" && Number.isFinite(o)) return clamp(o);
  const saved = Number(await getSetting(supa, "tbs_marketplace_fee_pct"));
  if (Number.isFinite(saved) && saved > 0) return clamp(saved);
  const env = Number(process.env.TBS_MARKETPLACE_FEE_PCT);
  if (Number.isFinite(env) && env > 0) return clamp(env);
  return 5;
}
