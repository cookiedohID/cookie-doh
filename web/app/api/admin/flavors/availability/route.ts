// web/app/api/admin/flavors/availability/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

function checkAdminAuth(req: Request) {
  // Optional protection:
  // If you set ADMIN_TOKEN in Vercel env, admin POST requires header x-admin-token
  const token = process.env.ADMIN_TOKEN;
  if (!token) return true;
  const got = req.headers.get("x-admin-token") || "";
  return got === token;
}

export async function POST(req: Request) {
  try {
    if (!checkAdminAuth(req)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const flavor_id = String(body?.flavor_id || "").trim();
    const sold_out = Boolean(body?.sold_out);

    if (!flavor_id) {
      return NextResponse.json(
        { ok: false, error: "Missing flavor_id" },
        { status: 400 }
      );
    }

    const supa = supaAdmin();
    const { error } = await supa
      .from("flavor_availability")
      .upsert(
        { flavor_id, sold_out, updated_at: new Date().toISOString() },
        { onConflict: "flavor_id" }
      );

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
