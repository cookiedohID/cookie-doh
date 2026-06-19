// web/app/api/account/addresses/route.ts
// Saved addresses (multiple per member). Every query is scoped to the phone
// derived from the verified Bearer token — never from the request body — and the
// customer record for that phone must belong to this user. Mirrors the ownership
// guard in /api/account/me so a signed-in user can't touch another member's data.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canonicalPhone } from "@/lib/phone";

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

// Resolve the verified user -> their owned canonical phone, or null.
export async function ownedPhone(supa: any, req: Request): Promise<{ user: any; phone: string } | null> {
  const token = bearer(req);
  if (!token) return null;
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data?.user) return null;
  const user = data.user;
  const phone = user?.user_metadata?.phone ? canonicalPhone(String(user.user_metadata.phone)) : null;
  if (!phone) return null;
  const { data: cust } = await supa.from("customers").select("auth_user_id").eq("phone", phone).maybeSingle();
  if (!cust || cust.auth_user_id !== user.id) return null;
  return { user, phone };
}

// Whitelist + sanitize the address fields a client may set.
function cleanAddress(body: any) {
  const str = (v: any) => (v == null ? null : String(v).trim() || null);
  const num = (v: any) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
  return {
    label: str(body?.label),
    recipient_name: str(body?.recipient_name),
    recipient_phone: body?.recipient_phone ? canonicalPhone(String(body.recipient_phone)) : null,
    address: str(body?.address),
    building_name: str(body?.building_name),
    postal: str(body?.postal),
    city: str(body?.city),
    destination_area_id: str(body?.destination_area_id),
    destination_area_label: str(body?.destination_area_label),
    lat: num(body?.lat),
    lng: num(body?.lng),
    is_default: Boolean(body?.is_default),
  };
}

export async function GET(req: Request) {
  try {
    const supa = supaAdmin();
    const owner = await ownedPhone(supa, req);
    if (!owner) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    const { data, error } = await supa
      .from("customer_addresses")
      .select("*")
      .eq("phone", owner.phone)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    // Degrade gracefully if the table isn't created yet (migration not run).
    if (error) return NextResponse.json({ ok: true, addresses: [], notReady: true });
    return NextResponse.json({ ok: true, addresses: data || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const supa = supaAdmin();
    const owner = await ownedPhone(supa, req);
    if (!owner) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const fields = cleanAddress(body);
    if (!fields.address) return NextResponse.json({ ok: false, error: "Address is required." }, { status: 400 });

    // Only one default per phone — clear the previous default first.
    if (fields.is_default) {
      await supa.from("customer_addresses").update({ is_default: false }).eq("phone", owner.phone).eq("is_default", true);
    }

    const { data, error } = await supa
      .from("customer_addresses")
      .insert({ ...fields, phone: owner.phone })
      .select("*")
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, address: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
