// web/lib/promo.ts — validate a promo code and compute its discount.
// Server-only. The SAME function runs at the /api/promo/validate preview AND in
// the checkout route, so the client can never dictate the discount.
import { phoneSignificant } from "@/lib/phone";
import { formatIDR } from "@/lib/catalog";

export type PromoValidation = {
  valid: boolean;
  discount: number; // IDR off the merchandise subtotal
  code?: string;
  label?: string; // e.g. "15% off", "Rp20.000 off"
  reason?: string; // why it was rejected (shown to the customer)
};

const rp = (n: number) => `Rp${formatIDR(Math.round(Number(n || 0)))}`;

// A bare "YYYY-MM-DD" expiry means "valid through the END of that day in Jakarta"
// (UTC+7). Parsing it raw would make it UTC midnight = 07:00 WIB, killing the code
// ~17h early. Datetimes with a time component are passed through unchanged.
export function endOfDayJakarta(input: string): string {
  const s = String(input || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T23:59:59+07:00`).toISOString();
  return new Date(s).toISOString();
}

export async function validatePromo(
  supa: any,
  rawCode: string,
  subtotal: number,
  phone?: string | null
): Promise<PromoValidation> {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { valid: false, discount: 0, reason: "Enter a code" };
  const sub = Math.max(0, Math.floor(Number(subtotal || 0)));

  let promo: any;
  try {
    const { data } = await supa.from("promo_codes").select("*").eq("code", code).maybeSingle();
    promo = data;
  } catch {
    return { valid: false, discount: 0, reason: "Promo codes are unavailable right now" };
  }
  if (!promo) return { valid: false, discount: 0, reason: "That code doesn't exist" };
  if (!promo.active) return { valid: false, discount: 0, reason: "This code is no longer active" };

  const now = Date.now();
  if (promo.starts_at && new Date(promo.starts_at).getTime() > now) return { valid: false, discount: 0, reason: "This code isn't active yet" };
  if (promo.expires_at && new Date(promo.expires_at).getTime() < now) return { valid: false, discount: 0, reason: "This code has expired" };
  if (sub < Number(promo.min_subtotal || 0)) {
    return { valid: false, discount: 0, reason: `Spend at least ${rp(promo.min_subtotal)} to use this code` };
  }

  // Usage limits — DERIVED by counting recorded (PAID) redemptions.
  const perCustomer = Number(promo.per_customer_limit || 0);
  // A per-customer-limited code is meaningless without a phone to key on — require one.
  if (perCustomer > 0 && !phoneSignificant(phone || "")) {
    return { valid: false, discount: 0, reason: "Add a valid phone number to use this code" };
  }
  if (promo.usage_limit != null || perCustomer > 0) {
    const { data: reds, error: redErr } = await supa.from("promo_redemptions").select("phone").eq("code", code);
    if (redErr) {
      // Fail CLOSED for limited codes — a transient error must never make a capped
      // code unlimited. (A genuinely-missing table is the only "treat as empty" case.)
      const missing = /does not exist|relation .* does not exist/i.test(redErr.message || "");
      if (!missing) return { valid: false, discount: 0, reason: "This code is temporarily unavailable — please try again" };
    }
    const all = reds || [];
    if (promo.usage_limit != null && all.length >= Number(promo.usage_limit)) {
      return { valid: false, discount: 0, reason: "This code has been fully used" };
    }
    if (perCustomer > 0) {
      const sig = phoneSignificant(phone || "");
      const mine = all.filter((r: any) => phoneSignificant(r?.phone) === sig).length;
      if (mine >= perCustomer) {
        return { valid: false, discount: 0, reason: "You've already used this code" };
      }
    }
  }

  // Compute the discount on the merchandise subtotal.
  let discount = 0;
  if (promo.type === "fixed") {
    discount = Math.min(Number(promo.value || 0), sub);
  } else {
    discount = Math.floor((sub * Number(promo.value || 0)) / 100);
    if (promo.max_discount != null) discount = Math.min(discount, Number(promo.max_discount));
  }
  discount = Math.max(0, Math.min(discount, sub));
  if (discount <= 0) return { valid: false, discount: 0, reason: "This code gives no discount on your current cart" };

  const label = promo.type === "fixed" ? `${rp(promo.value)} off` : `${promo.value}% off`;
  return { valid: true, discount, code, label };
}
