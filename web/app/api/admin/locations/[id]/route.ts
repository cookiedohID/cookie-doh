// web/app/api/admin/locations/[id]/route.ts — update / delete a location.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supa = supaAdmin();
    const b = await req.json().catch(() => ({}));
    const num = (v: any) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
    const patch: any = { updated_at: new Date().toISOString() };
    if (b?.name != null) patch.name = String(b.name).trim();
    if (b?.short != null) patch.short = String(b.short).trim();
    if (b?.address != null) patch.address = String(b.address).trim() || null;
    if ("lat" in b) patch.lat = num(b.lat);
    if ("lng" in b) patch.lng = num(b.lng);
    if ("active" in b) patch.active = Boolean(b.active);

    const { data, error } = await supa.from("locations").update(patch).eq("id", id).select("*").maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, location: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supa = supaAdmin();
    const { error } = await supa.from("locations").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
