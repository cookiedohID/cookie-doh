// web/app/api/admin/promos/[id]/route.ts — toggle/edit or delete a promo code.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { endOfDayJakarta } from "@/lib/promo";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = await req.json().catch(() => ({}));
    const patch: any = {};
    if (typeof b?.active === "boolean") patch.active = b.active;
    if (b?.expires_at !== undefined) patch.expires_at = b.expires_at ? endOfDayJakarta(b.expires_at) : null;
    if (b?.usage_limit !== undefined) patch.usage_limit = b.usage_limit ? Math.max(1, Math.floor(Number(b.usage_limit))) : null;
    if (b?.description !== undefined) patch.description = b.description ? String(b.description).slice(0, 200) : null;
    if (!Object.keys(patch).length) return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });

    const supa = supaAdmin();
    const { error } = await supa.from("promo_codes").update(patch).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supa = supaAdmin();
    const { error } = await supa.from("promo_codes").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 400 });
  }
}
