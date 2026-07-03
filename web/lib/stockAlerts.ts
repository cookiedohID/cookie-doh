// web/lib/stockAlerts.ts
//
// Shared "back in stock" helpers. Used by the inventory availability toggle
// (admin/flavors) and the production plan (admin/production → add to inventory),
// so both detect a sold-out → available flip the same way and send the same
// WhatsApp to waiting subscribers.
import { FLAVORS } from "@/lib/catalog";
import { sendWhatsApp } from "@/lib/whatsapp";

// Storefront sold-out for an item: true only when EVERY tracked location is
// effectively sold out (mirrors /api/flavors/availability). No tracked rows →
// not sold out (i.e. untracked/unlimited).
export async function aggSoldOut(supa: any, item_id: string): Promise<boolean> {
  const { data } = await supa.from("location_stock").select("sold_out, stock").eq("item_id", item_id);
  const rows = data || [];
  if (!rows.length) return false;
  let soldOutCount = 0;
  for (const r of rows) {
    const eff = Boolean(r.sold_out) || (typeof r.stock === "number" && r.stock <= 0);
    if (eff) soldOutCount += 1;
  }
  return soldOutCount >= rows.length;
}

// Fire when a flavour flips sold-out → available: WhatsApp everyone subscribed,
// then clear them. Never throws (best-effort; table may not exist yet).
// Returns how many subscribers were notified.
export async function notifyBackInStock(supa: any, item_id: string): Promise<number> {
  try {
    // Claim the subscribers atomically: DELETE … RETURNING hands each row to
    // exactly one caller, so two concurrent bakes of the same flavour can't both
    // read the same list and double-send. (Trade-off: if the WhatsApp send below
    // fails, those rows are already gone — acceptable for a best-effort alert.)
    const { data: claimed } = await supa
      .from("stock_subscriptions").delete().eq("item_id", item_id).select("phone");
    const phones = [...new Set((claimed || []).map((s: any) => String(s?.phone || "")).filter(Boolean))];
    if (!phones.length) return 0;
    const name = FLAVORS.find((f) => f.id === item_id)?.name || "Your cookie";
    const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.cookiedoh.co.id").replace(/\/$/, "");
    const message = `🍪 Good news! ${name} is BACK IN STOCK at Cookie Doh — grab it before it sells out again: ${site}/build`;
    const BATCH = 5;
    for (let i = 0; i < phones.length; i += BATCH) {
      await Promise.all(phones.slice(i, i + BATCH).map((to: any) => sendWhatsApp({ to, message })));
    }
    return phones.length;
  } catch (e) {
    console.error("back-in-stock notify failed:", e);
    return 0;
  }
}
