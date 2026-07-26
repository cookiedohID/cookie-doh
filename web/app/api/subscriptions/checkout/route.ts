// web/app/api/subscriptions/checkout/route.ts
//
// Start a prepaid subscription plan: create (or renew) the subscription, create a
// PENDING plan row, and return a Midtrans Snap token for ONE QRIS payment of
// N boxes. The payment webhook (CD-SUB- branch) activates it.
//
// Security rules (mirrors the cart checkout + the design review):
//   • AUTH REQUIRED — the buyer must be signed in.
//   • owner_phone is derived from the server-verified OTP-bound phone, NEVER the body.
//   • amount is server-computed (N × box price); the client never sends a price.
//   • midtrans_order_id is server-generated; a client-supplied one is ignored.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSnapToken, midtransEnv } from "@/lib/midtrans";
import { canonicalPhone } from "@/lib/phone";
import {
  subPlanGrandTotal, makeSubOrderId, isValidBoxSize, isValidPlanBoxes, isValidFrequency, isValidMode,
  normalizeFixedFlavours, fixedFlavoursValid, type SubFulfilment,
} from "@/lib/subscriptions";

export const runtime = "nodejs";

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}
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
async function getUser(supa: any, token: string | null) {
  if (!token) return null;
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}
function phoneFromUser(user: any): string | null {
  const p = user?.user_metadata?.phone || user?.phone || null;
  return p ? canonicalPhone(String(p)) : null;
}
// The phone OTP-bound to THIS user (same logic as /api/account/me) — never trust input.
async function boundPhoneForUser(supa: any, userId: string): Promise<string | null> {
  const { data: custRows } = await supa
    .from("customers").select("phone, phone_verified").eq("auth_user_id", userId).limit(1);
  const cust = custRows?.[0];
  if (cust?.phone && cust.phone_verified) return canonicalPhone(String(cust.phone));
  const { data: otpRows } = await supa
    .from("phone_otps").select("phone").eq("auth_user_id", userId).eq("verified", true).limit(1);
  const otp = otpRows?.[0];
  if (otp?.phone) return canonicalPhone(String(otp.phone));
  return null;
}

export async function POST(req: Request) {
  try {
    const supabase = supaAdmin();
    const siteUrl = getSiteUrl();

    // ---- Auth + server-derived identity ----
    const user = await getUser(supabase, bearer(req));
    if (!user) {
      return NextResponse.json({ ok: false, error: "Please sign in to subscribe." }, { status: 401 });
    }
    const ownerPhone = phoneFromUser(user) || (await boundPhoneForUser(supabase, user.id));
    if (!ownerPhone) {
      return NextResponse.json(
        { ok: false, error: "Add and verify your phone number first (Account → membership), then subscribe." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const boxes = Number(body?.boxes);
    if (!isValidPlanBoxes(boxes)) return NextResponse.json({ ok: false, error: "Choose a 4, 8 or 12-box plan." }, { status: 400 });

    const name = String(body?.name || user.user_metadata?.name || "").trim() || null;
    const email = String(body?.email || user.email || "").trim() || null;

    // A renewal adds capacity to an existing subscription the caller OWNS (box size
    // + config come from that subscription). Otherwise we create a fresh one. Either
    // way the amount and order id are server-made; the client never sends a price.
    let subscriptionId: string;
    let boxSize: number;
    let descMode = "";
    let descFreq = "";
    let fulfilmentForFee: SubFulfilment = "delivery";
    const renewId = String(body?.renew_subscription_id || "").trim();

    if (renewId) {
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("id, owner_phone, auth_user_id, box_size, mode, frequency, status, fulfilment")
        .eq("id", renewId)
        .maybeSingle();
      if (!existing) return NextResponse.json({ ok: false, error: "Subscription not found." }, { status: 404 });
      const owns = existing.auth_user_id === user.id || existing.owner_phone === ownerPhone;
      if (!owns) return NextResponse.json({ ok: false, error: "Not your subscription." }, { status: 403 });
      if (existing.status === "cancelled") {
        return NextResponse.json({ ok: false, error: "This subscription was cancelled — please start a new one." }, { status: 400 });
      }
      subscriptionId = existing.id;
      boxSize = Number(existing.box_size);
      descMode = existing.mode;
      descFreq = existing.frequency;
      fulfilmentForFee = existing.fulfilment === "pickup" ? "pickup" : "delivery";
    } else {
      boxSize = Number(body?.box_size);
      const frequency = String(body?.frequency || "");
      const mode = String(body?.mode || "");
      const fulfilment: SubFulfilment = body?.fulfilment === "pickup" ? "pickup" : "delivery";
      fulfilmentForFee = fulfilment;

      if (!isValidBoxSize(boxSize)) return NextResponse.json({ ok: false, error: "Choose a box of 3 or 6." }, { status: 400 });
      if (!isValidFrequency(frequency)) return NextResponse.json({ ok: false, error: "Choose a delivery frequency." }, { status: 400 });
      if (!isValidMode(mode)) return NextResponse.json({ ok: false, error: "Choose fixed favourites or curated surprise." }, { status: 400 });

      const fixedFlavours = mode === "fixed" ? normalizeFixedFlavours(body?.fixed_flavours) : [];
      if (mode === "fixed" && !fixedFlavoursValid(fixedFlavours, boxSize)) {
        return NextResponse.json({ ok: false, error: `Pick exactly ${boxSize} cookies for your fixed box.` }, { status: 400 });
      }

      // Delivery needs an address; pickup needs a point. Snapshot is read live at fulfilment.
      const shipSnapshot: any = {};
      if (fulfilment === "delivery") {
        const address = String(body?.delivery?.address || "").trim();
        if (!address) return NextResponse.json({ ok: false, error: "Add a delivery address." }, { status: 400 });
        shipSnapshot.address = address;
        shipSnapshot.building_name = String(body?.delivery?.buildingName || "").trim() || null;
        shipSnapshot.postal = String(body?.delivery?.postal || "").trim() || null;
        shipSnapshot.destination_area_id = String(body?.delivery?.destination_area_id || "").trim() || null;
        shipSnapshot.destination_area_label = String(body?.delivery?.destination_area_label || "").trim() || null;
        shipSnapshot.notes = String(body?.notes || "").trim() || null;
      } else {
        const pointName = String(body?.pickup?.pointName || "").trim();
        if (!pointName) return NextResponse.json({ ok: false, error: "Choose a pickup point." }, { status: 400 });
        shipSnapshot.pickup_point = pointName;
      }

      const anchorDom =
        frequency === "monthly" && Number(body?.anchor_dom) >= 1 && Number(body?.anchor_dom) <= 31
          ? Math.floor(Number(body.anchor_dom))
          : null;

      const { data: subRow, error: subErr } = await supabase
        .from("subscriptions")
        .insert({
          owner_phone: ownerPhone, auth_user_id: user.id, name, email,
          box_size: boxSize, mode, frequency, fixed_flavours: fixedFlavours,
          anchor_dom: anchorDom, fulfilment, ship_snapshot: shipSnapshot, status: "pending_payment",
        })
        .select("id")
        .maybeSingle();
      if (subErr || !subRow?.id) throw subErr || new Error("Subscription insert failed");
      subscriptionId = subRow.id;
      descMode = mode;
      descFreq = frequency;
    }

    if (!isValidBoxSize(boxSize)) return NextResponse.json({ ok: false, error: "Invalid box size." }, { status: 400 });

    // ---- Server-authoritative amount (cookies + delivery; pickup = no delivery) ----
    const amount = subPlanGrandTotal(boxSize, boxes, fulfilmentForFee);
    if (amount < 1) return NextResponse.json({ ok: false, error: "Invalid plan." }, { status: 400 });

    // ---- Plan row (server-generated order id; PENDING until webhook) ----
    const midtransOrderId = makeSubOrderId();
    const { data: planRow, error: planErr } = await supabase
      .from("subscription_plans")
      .insert({
        subscription_id: subscriptionId,
        boxes_total: boxes,
        boxes_used: 0,
        amount_idr: amount,
        midtrans_order_id: midtransOrderId,
        payment_status: "PENDING",
      })
      .select("id")
      .maybeSingle();
    if (planErr || !planRow?.id) throw planErr || new Error("Plan insert failed");

    // ---- Midtrans Snap token (QRIS popup) ----
    const itemsText =
      `Cookie Doh subscription — ${boxes} × box of ${boxSize} ` +
      `(${descMode === "fixed" ? "fixed favourites" : "curated surprise"}, ${descFreq})`;
    const token = await createSnapToken({
      order_id: midtransOrderId,
      gross_amount: amount,
      customer: { name: name || "", phone: ownerPhone, email: email || "" },
      siteUrl,
      itemsText,
    });

    return NextResponse.json({
      ok: true,
      snap_token: token,
      midtrans_order_id: midtransOrderId,
      subscription_id: subscriptionId,
      plan_id: planRow.id,
      amount_idr: amount,
      env: midtransEnv(),
    });
  } catch (e: any) {
    console.error("[subscriptions/checkout] error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Could not start subscription." }, { status: 400 });
  }
}
