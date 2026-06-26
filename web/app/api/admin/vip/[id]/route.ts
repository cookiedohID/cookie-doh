// web/app/api/admin/vip/[id]/route.ts — edit (incl. activate/pause) or delete a VIP tier.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    if (typeof b?.name === "string") patch.name = b.name.trim().slice(0, 30);
    if (b?.reach_annual_idr != null) patch.reach_annual_idr = Math.max(0, Math.floor(Number(b.reach_annual_idr)));
    if (b?.maintain_monthly_idr != null) patch.maintain_monthly_idr = Math.max(0, Math.floor(Number(b.maintain_monthly_idr)));
    if (b?.loyalty_per_free != null) patch.loyalty_per_free = Math.min(10, Math.max(1, Math.floor(Number(b.loyalty_per_free))));
    if (typeof b?.free_delivery === "boolean") patch.free_delivery = b.free_delivery;
    if (typeof b?.free_cookie_per_order === "boolean") patch.free_cookie_per_order = b.free_cookie_per_order;
    if (typeof b?.active === "boolean") patch.active = b.active;

    if (patch.name === "") return NextResponse.json({ ok: false, error: "Name can't be empty." }, { status: 400 });
    if (patch.reach_annual_idr === 0) return NextResponse.json({ ok: false, error: "Set the annual spend to reach this tier." }, { status: 400 });
    if (!Object.keys(patch).length) return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });

    const supa = supaAdmin();
    const { error } = await supa.from("vip_tiers").update(patch).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supa = supaAdmin();
    const { error } = await supa.from("vip_tiers").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 400 });
  }
}
