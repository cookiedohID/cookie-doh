// web/app/api/whatsapp/inbound/route.ts
//
// Inbound WhatsApp webhook (Fonnte → here). Fonnte POSTs each incoming customer
// message to this URL; we run it through the Claude assistant (lib/waBot) and
// reply via Fonnte. Conversation memory + human-handoff pause in wa_messages /
// wa_state.
//
// SETUP (owner):
//   1. Set ANTHROPIC_API_KEY (and optionally WA_INBOUND_SECRET) in Vercel.
//   2. In the Fonnte device dashboard, set the incoming webhook URL to:
//        https://www.cookiedoh.co.id/api/whatsapp/inbound?key=<WA_INBOUND_SECRET>
//      (the ?key=... is only needed if WA_INBOUND_SECRET is set.)

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canonicalPhone } from "@/lib/phone";
import { sendWhatsApp } from "@/lib/whatsapp";
import { runWaBot, type WaTurn } from "@/lib/waBot";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

const HANDOFF_PAUSE_HOURS = 3;
const HISTORY_TURNS = 10;

// Fonnte posts form-urlencoded by default, JSON if the device is configured for it.
async function parseInbound(req: Request): Promise<Record<string, string>> {
  const raw = await req.text();
  if (!raw) return {};
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { return JSON.parse(raw) as Record<string, string>; } catch { /* fall through */ }
  }
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
  return out;
}

function authorized(req: Request): boolean {
  const secret = process.env.WA_INBOUND_SECRET;
  if (!secret) return true; // not configured → allow (dev); set it in prod
  const url = new URL(req.url);
  const provided = url.searchParams.get("key") || req.headers.get("x-webhook-key") || "";
  return provided === secret;
}

// Fonnte's "test webhook" button sends a GET — answer it so setup shows green.
export async function GET() {
  return NextResponse.json({ ok: true, service: "cookie-doh whatsapp inbound" });
}

export async function POST(req: Request) {
  try {
    if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = await parseInbound(req);
    const text = String(body.message || body.text || "").trim();
    const sender = canonicalPhone(body.sender || body.phone || body.from);
    const name = String(body.name || "").trim();
    const inboundId = String(body.id || body.message_id || "").trim();
    const isGroup = !!(body.group || body.isgroup === "true");

    // Ignore: no text, no sender, or a group message (we only do 1:1).
    if (!text || !sender || isGroup) return NextResponse.json({ ok: true, skipped: true });

    const supa = supaAdmin();

    // Dedupe Fonnte retries by message id.
    const { data: state } = await supa
      .from("wa_state")
      .select("auto_paused_until, last_inbound_id")
      .eq("phone", sender)
      .maybeSingle();
    if (inboundId && state?.last_inbound_id === inboundId) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    // Always record the customer's message (for context + so the owner can read it).
    await supa.from("wa_messages").insert({ phone: sender, role: "user", text });

    const pausedUntil = state?.auto_paused_until ? new Date(state.auto_paused_until).getTime() : 0;
    const isPaused = pausedUntil > Date.now();

    // A human is currently handling this number → stay quiet, just log + dedupe.
    if (isPaused) {
      await supa.from("wa_state").upsert({ phone: sender, last_inbound_id: inboundId || null, updated_at: new Date().toISOString() });
      return NextResponse.json({ ok: true, paused: true });
    }

    // Recent conversation (oldest→newest), excluding the message we just stored.
    const { data: hist } = await supa
      .from("wa_messages")
      .select("role, text, created_at")
      .eq("phone", sender)
      .order("created_at", { ascending: false })
      .limit(HISTORY_TURNS + 1);
    const history: WaTurn[] = (hist || [])
      .slice(1) // drop the just-inserted current message
      .reverse()
      .map((m: any) => ({ role: m.role, text: m.text }));

    const result = await runWaBot({ supa, phone: sender, text, history });

    // Decide what to send + whether to escalate to the owner.
    const holding = "Thanks for messaging Cookie Doh! 🍪 Let me get a teammate to help you here — they'll reply shortly 💛";
    let outgoing: string;
    let notifyOwner = false;
    let pause = false;
    let escalateReason = "";

    if (!result.configured) {
      outgoing = "Thanks for messaging Cookie Doh! 🍪 A teammate will get back to you shortly 💛";
      notifyOwner = true;
      escalateReason = "AI assistant not configured (ANTHROPIC_API_KEY missing) — inbound message";
    } else if (result.handoff || !result.reply) {
      outgoing = result.reply || holding;
      notifyOwner = true;
      pause = true;
      escalateReason = result.handoff?.reason || "Needs a teammate";
    } else {
      outgoing = result.reply;
    }

    // Send the reply to the customer.
    await sendWhatsApp({ to: sender, message: outgoing });
    await supa.from("wa_messages").insert({ phone: sender, role: "assistant", text: outgoing });

    // Notify the owner on handoff / unconfigured.
    if (notifyOwner) {
      const who = name ? `${name} (${sender})` : sender;
      const lines = [
        `🙋 WhatsApp: ${who} needs a hand`,
        escalateReason ? `Reason: ${escalateReason}` : "",
        `Their message: "${text}"`,
        pause ? `Auto-replies paused ${HANDOFF_PAUSE_HOURS}h — reply them directly on WhatsApp.` : "Reply them directly on WhatsApp.",
      ].filter(Boolean);
      await sendWhatsApp({ message: lines.join("\n") }); // owner = ADMIN_NOTIFY_WHATSAPP
    }

    // Persist state (pause window on handoff + dedupe id).
    const auto_paused_until = pause
      ? new Date(Date.now() + HANDOFF_PAUSE_HOURS * 3600 * 1000).toISOString()
      : (isPaused ? state?.auto_paused_until : null);
    await supa.from("wa_state").upsert({
      phone: sender,
      auto_paused_until,
      last_inbound_id: inboundId || null,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[whatsapp/inbound] error:", e?.message || e);
    // 200 so Fonnte doesn't hammer retries on our errors.
    return NextResponse.json({ ok: false, error: e?.message || "error" });
  }
}
