// web/lib/customers.ts
//
// Upsert a customer when an order is placed. Never throws (so it can't break
// checkout). Keyed by canonical phone so 08/+628/628 map to one record.

import { canonicalPhone } from "@/lib/phone";

export async function upsertCustomerForOrder(
  supabase: any,
  input: { name?: string | null; phone?: string | null; email?: string | null }
): Promise<string | null> {
  try {
    const phone = canonicalPhone(input.phone);
    if (!phone) return null;

    const now = new Date().toISOString();
    const patch: Record<string, any> = { phone, updated_at: now, last_order_at: now };
    // Only overwrite name/email when we actually have a value (don't wipe).
    if (input.name && String(input.name).trim()) patch.name = String(input.name).trim();
    if (input.email && String(input.email).trim()) patch.email = String(input.email).trim();

    const { data, error } = await supabase
      .from("customers")
      .upsert(patch, { onConflict: "phone" })
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[customers] upsert failed:", error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (e: any) {
    console.error("[customers] upsert threw:", e?.message || e);
    return null;
  }
}
