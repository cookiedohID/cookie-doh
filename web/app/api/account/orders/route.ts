// web/app/api/account/orders/route.ts
// Member-facing order history. Auth + ownership guard mirrors /api/account/me:
// the phone comes ONLY from the verified Bearer token, and the customer record
// for that phone must belong to this user — so a signed-in user can never read
// another member's orders. Read-only; never touches checkout/webhook code.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canonicalPhone, phoneSignificant } from "@/lib/phone";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
}

async function getUser(supa: any, token: string | null) {
  if (!token) return null;
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

function phoneFromUser(user: any): string | null {
  const meta = user?.user_metadata?.phone;
  return meta ? canonicalPhone(String(meta)) : null;
}

export async function GET(req: Request) {
  try {
    const supa = supaAdmin();
    const user = await getUser(supa, bearer(req));
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    const phone = phoneFromUser(user);
    if (!phone) return NextResponse.json({ ok: true, orders: [] });

    // Ownership guard: this user must own the customer record for this phone.
    const { data: cust } = await supa
      .from("customers")
      .select("auth_user_id")
      .eq("phone", phone)
      .maybeSingle();
    if (!cust || cust.auth_user_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Phone not verified for this account." }, { status: 403 });
    }

    const sig = phoneSignificant(phone);
    if (!sig) return NextResponse.json({ ok: true, orders: [] });

    const { data } = await supa
      .from("orders")
      .select("id, order_no, created_at, paid_at, total_idr, payment_status, fulfilment_status, items_json, meta, customer_phone")
      .ilike("customer_phone", `%${sig}%`)
      .order("created_at", { ascending: false })
      .limit(200);

    const orders = (data || [])
      // ilike is only a loose prefilter — require an EXACT canonical match so a
      // shorter significant string can't match inside a different number.
      .filter((o: any) => phoneSignificant(o?.customer_phone) === sig)
      .map((o: any) => {
        const items = Array.isArray(o?.items_json)
          ? o.items_json.map((it: any) => ({
              name: String(it?.name ?? "Item"),
              qty: Number(it?.quantity ?? 1),
              price: Number(it?.price ?? 0),
              // ONLY an explicitly-redeemed reward is "free". A zero per-line price
              // usually means a box/bundle item (priced at the set level), not a
              // giveaway — labelling those "free" wrongly looked like we gave them away.
              free: it?.free === true,
            }))
          : [];
        return {
          id: o.id,
          orderNo: o.order_no ?? null,
          createdAt: o.created_at,
          paidAt: o.paid_at,
          total: Number(o.total_idr ?? 0),
          status: o.payment_status || "PENDING",
          channel: o?.meta?.channel === "cafe" ? "Cafe" : (o.fulfilment_status || "Online"),
          items,
        };
      });

    return NextResponse.json({ ok: true, orders });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
