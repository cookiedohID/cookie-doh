// web/app/api/account/tbs/route.ts
//
// Federated TotalBuahStore (TBS) rewards proxy for the Cookie Doh account page.
// Verifies the member's Supabase session, resolves the phone that is OTP-VERIFIED
// and bound to THIS user (never a client-supplied number), and fetches that
// member's TBS rewards + receipt history from the TBS Cloud Run partner endpoint —
// keeping the shared partner token server-side. Read-only.
//
// Feature-flagged: with no TBS_PARTNER_API_URL / _TOKEN set it returns
// { configured:false }, so the account page shows nothing new until it's wired.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canonicalPhone } from "@/lib/phone";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
}

// The phone must be OTP-verified AND bound to this exact auth user — resolved
// strictly from the server-derived user.id, mirroring /api/account/me's
// boundPhoneForUser. A client can never inject someone else's number.
async function verifiedPhoneFor(supa: any, token: string | null): Promise<string | null> {
  if (!token) return null;
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data?.user) return null;
  const userId = data.user.id;

  const { data: custRows } = await supa
    .from("customers").select("phone")
    .eq("auth_user_id", userId).eq("phone_verified", true).limit(1);
  if (custRows?.[0]?.phone) return canonicalPhone(String(custRows[0].phone));

  const { data: otpRows } = await supa
    .from("phone_otps").select("phone")
    .eq("auth_user_id", userId).eq("verified", true).limit(1);
  if (otpRows?.[0]?.phone) return canonicalPhone(String(otpRows[0].phone));

  return null;
}

// Shape the partner response into the stable contract the account page renders.
// Defensive: never trusts the upstream shape blindly.
function normalize(j: any): any {
  const found = Boolean(j?.found);
  if (!found) return { ok: true, configured: true, found: false };
  const m = j.member || {};
  const p = j.points || {};
  const h = j.history || {};
  const receiptsRaw = Array.isArray(h.receipts) ? h.receipts : Array.isArray(h) ? h : [];
  const receipts = receiptsRaw
    .map((r: any) => ({
      date: String(r?.date || ""),
      store: String(r?.store || ""),
      receiptNo: String(r?.receiptNo || ""),
      total: Math.max(0, Math.floor(Number(r?.total || 0))),
      pointsEarned: Math.max(0, Math.floor(Number(r?.pointsEarned || 0))),
      items: (Array.isArray(r?.items) ? r.items : []).map((it: any) => ({
        sku: String(it?.sku || ""),
        name: String(it?.name || ""),
        qty: Math.max(1, Math.floor(Number(it?.qty || 1))),
        amount: Math.max(0, Math.floor(Number(it?.amount || 0))),
        url: typeof it?.url === "string" ? it.url : "",
        status: ["in_stock", "out_of_stock", "discontinued"].includes(it?.status) ? it.status : "in_stock",
      })),
    }))
    // Drop entirely-empty receipts so a malformed upstream row can't render as a blank ghost line.
    .filter((r: any) => r.date || r.store || r.total > 0 || r.items.length > 0);
  return {
    ok: true,
    configured: true,
    found: true,
    member: { name: m.name ?? null, tier: m.tier ?? null, memberSince: m.memberSince ?? null },
    points: {
      balance: Math.max(0, Math.floor(Number(p.balance || 0))),
      expiryMonths: Number(p.expiryMonths) || null,
      expiring: (Array.isArray(p.expiring) ? p.expiring : []).map((e: any) => ({
        amount: Math.max(0, Math.floor(Number(e?.amount || 0))),
        on: String(e?.on || ""),
      })),
    },
    history: { total: Math.max(0, Math.floor(Number(h.total || receipts.length))), offset: Math.max(0, Math.floor(Number(h.offset || 0))), receipts },
  };
}

// Tiny per-phone+page cache (best-effort; per serverless instance) to avoid
// hammering the ERP on repeated loads.
const CACHE = new Map<string, { at: number; data: any }>();
const TTL_MS = 60_000;

export async function GET(req: Request) {
  try {
    const base = process.env.TBS_PARTNER_API_URL;
    const partnerToken = process.env.TBS_PARTNER_API_TOKEN;
    if (!base || !partnerToken) return NextResponse.json({ ok: true, configured: false });

    const supa = supaAdmin();
    const phone = await verifiedPhoneFor(supa, bearer(req));
    if (!phone) return NextResponse.json({ ok: true, configured: true, found: false, reason: "no_verified_phone" });

    const url = new URL(req.url);
    const offset = Math.max(0, Math.floor(Number(url.searchParams.get("offset")) || 0));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(url.searchParams.get("limit")) || 20)));

    const cacheKey = `${phone}|${offset}|${limit}`;
    const cached = CACHE.get(cacheKey);
    if (cached && Date.now() - cached.at < TTL_MS) return NextResponse.json(cached.data);

    const u = new URL(base);
    u.searchParams.set("phone", phone);
    u.searchParams.set("offset", String(offset));
    u.searchParams.set("limit", String(limit));

    const signal = typeof (AbortSignal as any)?.timeout === "function" ? (AbortSignal as any).timeout(8000) : undefined;
    const r = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${partnerToken}`, Accept: "application/json" },
      cache: "no-store",
      signal,
    });
    if (!r.ok) return NextResponse.json({ ok: true, configured: true, found: false, error: "tbs_unreachable" });
    const j = await r.json().catch(() => null);
    const data = normalize(j);
    CACHE.set(cacheKey, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch {
    // Never break the account page — the TBS tab just degrades.
    return NextResponse.json({ ok: true, configured: true, found: false, error: "error" });
  }
}
