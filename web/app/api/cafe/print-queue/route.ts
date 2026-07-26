// web/app/api/cafe/print-queue/route.ts
//
// Local print agent (print-agent/) endpoints. Token-gated.
//   GET  -> paid cafe orders not yet printed, enriched for the 3 docs
//   POST -> mark an order printed { id }
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SMOOTHIES } from "@/lib/smoothies";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Shared-secret auth — the agent sends this token; never expose orders publicly.
function authed(req: Request) {
  const expected = process.env.PRINT_AGENT_TOKEN;
  if (!expected) return false;
  const got = req.headers.get("x-print-agent-token") || "";
  return got === expected;
}

const INGREDIENTS_BY_ID: Record<string, string[]> = Object.fromEntries(
  SMOOTHIES.map((s) => [String(s.id), s.ingredients || []])
);

function parseItems(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

export async function GET(req: Request) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const supa = supaAdmin();

    const { data, error } = await supa
      .from("orders")
      .select("id, order_no, total_idr, paid_at, items_json")
      .eq("fulfilment_status", "cafe")
      .eq("payment_status", "PAID")
      .is("printed_at", null)
      .order("paid_at", { ascending: true })
      .limit(20);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const orders = (data || []).map((o: any) => ({
      id: o.id,
      orderNo: String(o.order_no ?? o.id),
      total: Number(o.total_idr || 0),
      paidAt: o.paid_at || null,
      lines: parseItems(o.items_json).map((it: any) => {
        const id = String(it?.id ?? "");
        const kind = it?.kind === "drink" ? "drink" : "cookie";
        return {
          id,
          name: String(it?.name ?? "Item"),
          kind,
          qty: Math.max(1, Math.floor(Number(it?.quantity ?? 1))),
          price: Math.max(0, Math.round(Number(it?.price ?? 0))),
          free: it?.free === true,
          ingredients: kind === "drink" ? INGREDIENTS_BY_ID[id] || [] : [],
        };
      }),
    }));

    return NextResponse.json({ ok: true, orders });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "");
    if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

    const supa = supaAdmin();
    const { error } = await supa
      .from("orders")
      .update({ printed_at: new Date().toISOString() })
      .eq("id", id)
      .is("printed_at", null); // idempotent — don't clobber an existing timestamp
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}
