// web/app/api/admin/broadcast/send/route.ts — send a WhatsApp broadcast to a
// segment. Admin-only (gated by proxy.ts). Recipients are recomputed here (never
// trusted from the client). Personalises {name} and appends an opt-out footer.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "@/lib/whatsapp";
import { getBroadcastRecipients, buildBroadcastText, type Segment } from "@/lib/broadcast";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PER_SEND = 600; // safety cap so one send can't run forever
const BATCH = 5;

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    if (!process.env.FONNTE_TOKEN) {
      return NextResponse.json({ ok: false, error: "WhatsApp isn't configured (FONNTE_TOKEN)." }, { status: 503 });
    }
    const body = await req.json().catch(() => ({}));
    const segment = (body?.segment || "all") as Segment;
    const message = String(body?.message || "").trim();
    if (message.length < 3) return NextResponse.json({ ok: false, error: "Write a message first." }, { status: 400 });

    const supa = supaAdmin();
    const all = await getBroadcastRecipients(supa, segment);
    const recipients = all.slice(0, MAX_PER_SEND);

    let sent = 0, failed = 0;
    for (let i = 0; i < recipients.length; i += BATCH) {
      const slice = recipients.slice(i, i + BATCH);
      const results = await Promise.all(
        slice.map((r) =>
          sendWhatsApp({ to: r.phone, message: buildBroadcastText(message, r.name) })
            .then((x) => x.ok)
            .catch(() => false)
        )
      );
      sent += results.filter(Boolean).length;
      failed += results.length - results.filter(Boolean).length;
    }

    return NextResponse.json({
      ok: true,
      sent,
      failed,
      total: all.length,
      capped: all.length > MAX_PER_SEND ? MAX_PER_SEND : 0,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Send failed" }, { status: 200 });
  }
}
