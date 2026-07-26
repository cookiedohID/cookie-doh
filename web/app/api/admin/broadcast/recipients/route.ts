// web/app/api/admin/broadcast/recipients/route.ts — preview count for a segment.
// Admin-only (gated by proxy.ts).
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getBroadcastRecipients, type Segment } from "@/lib/broadcast";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    const segment = (new URL(req.url).searchParams.get("segment") || "all") as Segment;
    const supa = supaAdmin();
    const recipients = await getBroadcastRecipients(supa, segment);
    return NextResponse.json({
      ok: true,
      count: recipients.length,
      sample: recipients.slice(0, 5).map((r) => r.name || r.phone),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 200 });
  }
}
