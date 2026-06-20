// web/lib/loyaltyGrants.ts — sum a phone's loyalty grants (referral bonuses etc.).
// Server-only. Mirrors loyaltyForPhone's format-agnostic matching: grants are
// stored canonical, but we match on significant digits to be safe across formats.
import { phoneSignificant } from "@/lib/phone";

export async function grantsForPhone(
  supa: any,
  phone: string
): Promise<{ cookies: number; drinks: number }> {
  const sig = phoneSignificant(phone);
  if (!sig) return { cookies: 0, drinks: 0 };
  try {
    const { data } = await supa
      .from("loyalty_grants")
      .select("phone, cookies, drinks")
      .ilike("phone", `%${sig}%`);
    let cookies = 0;
    let drinks = 0;
    for (const g of data || []) {
      if (phoneSignificant(g?.phone) !== sig) continue; // exact significant match
      cookies += Number(g?.cookies || 0);
      drinks += Number(g?.drinks || 0);
    }
    return { cookies: Math.max(0, cookies), drinks: Math.max(0, drinks) };
  } catch {
    // table not migrated yet — behave as if there are no grants
    return { cookies: 0, drinks: 0 };
  }
}
