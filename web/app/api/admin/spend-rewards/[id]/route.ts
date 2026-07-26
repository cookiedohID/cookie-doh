// web/app/api/admin/spend-rewards/[id]/route.ts — toggle active or delete a tier.
import { NextResponse } from "next/server";
import { supaAdmin } from "@/lib/supaAdmin";

export const runtime = "nodejs";

// data client → Cloud SQL (pg shim) via lib/supaAdmin; .auth still Supabase (P3).

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = await req.json().catch(() => ({}));
    const patch: any = {};
    if (typeof b?.active === "boolean") patch.active = b.active;
    if (!Object.keys(patch).length) return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
    const supa = supaAdmin();
    const { error } = await supa.from("spend_rewards").update(patch).eq("id", id);
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
    const { error } = await supa.from("spend_rewards").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 400 });
  }
}
