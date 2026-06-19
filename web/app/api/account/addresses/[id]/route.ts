// web/app/api/account/addresses/[id]/route.ts — update / delete one saved address.
// Security: the row's phone must equal the phone derived from the verified token,
// so a member can only modify their OWN addresses (id from the URL is never trusted alone).
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

async function ownedPhone(supa: any, req: Request): Promise<string | null> {
  const token = bearer(req);
  if (!token) return null;
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data?.user) return null;
  const user = data.user;
  const phone = user?.user_metadata?.phone ? canonicalPhone(String(user.user_metadata.phone)) : null;
  if (!phone) return null;
  const { data: cust } = await supa.from("customers").select("auth_user_id").eq("phone", phone).maybeSingle();
  if (!cust || cust.auth_user_id !== user.id) return null;
  return phone;
}

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

// Confirm the address belongs to this member before mutating it.
async function assertOwns(supa: any, id: string, phone: string): Promise<boolean> {
  const { data } = await supa.from("customer_addresses").select("phone").eq("id", id).maybeSingle();
  return Boolean(data && data.phone === phone);
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supa = supaAdmin();
    const phone = await ownedPhone(supa, req);
    if (!phone) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    if (!(await assertOwns(supa, id, phone))) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const fields = cleanAddress(await req.json().catch(() => ({})));
    if (!fields.address) return NextResponse.json({ ok: false, error: "Address is required." }, { status: 400 });

    if (fields.is_default) {
      await supa.from("customer_addresses").update({ is_default: false }).eq("phone", phone).eq("is_default", true);
    }

    const { data, error } = await supa
      .from("customer_addresses")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("phone", phone)
      .select("*")
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, address: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supa = supaAdmin();
    const phone = await ownedPhone(supa, req);
    if (!phone) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    if (!(await assertOwns(supa, id, phone))) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const { error } = await supa.from("customer_addresses").delete().eq("id", id).eq("phone", phone);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
