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
      .select("phone, cookies, drinks, order_id")
      .ilike("phone", `%${sig}%`);
    const mine = (data || []).filter((g: any) => phoneSignificant(g?.phone) === sig);
    if (!mine.length) return { cookies: 0, drinks: 0 }; // common case — no extra query

    // A grant tied to an order only counts while that order is still PAID, so
    // refunding/cancelling a referral's qualifying order claws the bonus back
    // automatically. Grants with no order_id (e.g. manual credits) always count.
    const orderIds = [...new Set(mine.map((g: any) => g?.order_id).filter(Boolean))];
    let paid = new Set<string>();
    if (orderIds.length) {
      const { data: ords } = await supa.from("orders").select("id, payment_status").in("id", orderIds);
      paid = new Set(
        (ords || []).filter((o: any) => String(o?.payment_status).toUpperCase() === "PAID").map((o: any) => o.id)
      );
    }

    let cookies = 0;
    let drinks = 0;
    for (const g of mine) {
      if (g?.order_id && !paid.has(g.order_id)) continue; // clawed back
      cookies += Number(g?.cookies || 0);
      drinks += Number(g?.drinks || 0);
    }
    return { cookies: Math.max(0, cookies), drinks: Math.max(0, drinks) };
  } catch {
    // table not migrated yet — behave as if there are no grants
    return { cookies: 0, drinks: 0 };
  }
}
