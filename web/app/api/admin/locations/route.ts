// web/app/api/admin/locations/route.ts — list / create store locations.
// Admin-only (gated by proxy.ts). Locations added here are inventory/transfer
// points; delivery routing still uses the built-in stores in lib/locations.ts.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

function slugify(s: string) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export async function GET() {
  try {
    const supa = supaAdmin();
    const { data, error } = await supa.from("locations").select("*").order("created_at", { ascending: true });
    if (error) return NextResponse.json({ ok: true, locations: [], notReady: true });
    return NextResponse.json({ ok: true, locations: data || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const supa = supaAdmin();
    const b = await req.json().catch(() => ({}));
    const name = String(b?.name || "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Name is required." }, { status: 400 });
    const id = (b?.id ? slugify(String(b.id)) : slugify(name)) || `loc-${Date.now()}`;
    const num = (v: any) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

    const row = {
      id,
      name,
      short: b?.short ? String(b.short).trim() : name,
      address: b?.address ? String(b.address).trim() : null,
      lat: num(b?.lat),
      lng: num(b?.lng),
      active: b?.active === false ? false : true,
    };
    const { data, error } = await supa.from("locations").insert(row).select("*").maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: /duplicate|unique/i.test(error.message) ? "A location with that name/id already exists." : error.message }, { status: 400 });
    return NextResponse.json({ ok: true, location: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
