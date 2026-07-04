// web/app/api/tbs/checkout/route.ts — create + charge a TotalBuahStore order.
//
// SERVER-AUTHORITATIVE MONEY PATH:
//   • prices come from the ERP (never the browser) — every line is repriced
//     against /api/partner/stock at the chosen store;
//   • the delivery fee is computed here from store→destination distance;
//   • the Midtrans charge amount is the server-computed total.
// The client's numbers are display-only. Payment success is handled by the
// existing Midtrans notification webhook, which pushes the order to the TBS
// back-office (idempotent on this order's id).
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSnapToken } from "@/lib/midtrans";
import {
  canSeeTbsShop, partnerGet, TBS_STORE_GEO, haversineKm,
  tbsDeliveryFee, TBS_DELIVERY_MAX_KM,
} from "@/lib/tbsShop";
import { canonicalPhone } from "@/lib/phone";

export const runtime = "nodejs";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    if (!canSeeTbsShop(req)) return NextResponse.json({ ok: false }, { status: 404 });
    const b = await req.json().catch(() => ({}));

    // ---- validate the basics --------------------------------------------
    const store = String(b?.store || "").toUpperCase();
    const geo = TBS_STORE_GEO[store];
    if (!geo) return NextResponse.json({ ok: false, error: "Pick a valid store." }, { status: 400 });

    const fulfil = b?.fulfil === "delivery" ? "delivery" : "pickup";
    const name = String(b?.customer?.name || "").trim().slice(0, 120);
    const phoneRaw = String(b?.customer?.phone || "").trim();
    const phone = canonicalPhone(phoneRaw);
    if (!name) return NextResponse.json({ ok: false, error: "Enter your name." }, { status: 400 });
    if (!phone) return NextResponse.json({ ok: false, error: "Enter a valid WhatsApp number (08… or +628…)." }, { status: 400 });
    const notes = String(b?.notes || "").slice(0, 400) || null;

    const rawLines = Array.isArray(b?.lines) ? b.lines.slice(0, 60) : [];
    if (!rawLines.length) return NextResponse.json({ ok: false, error: "Your basket is empty." }, { status: 400 });
    // merge duplicate skus, clamp quantities
    const wanted = new Map<string, number>();
    for (const l of rawLines) {
      const sku = String(l?.sku || "").trim().slice(0, 40);
      const qty = Math.max(1, Math.min(99, Math.round(Number(l?.qty) || 0)));
      if (sku) wanted.set(sku, Math.min(99, (wanted.get(sku) || 0) + qty));
    }
    if (!wanted.size) return NextResponse.json({ ok: false, error: "Your basket is empty." }, { status: 400 });

    // ---- REPRICE from the ERP (authoritative) ----------------------------
    const priced = await partnerGet("/stock", { store, skus: [...wanted.keys()].join(",") });
    if (!Array.isArray(priced)) return NextResponse.json({ ok: false, error: "The store is unreachable right now — please try again in a minute." }, { status: 200 });
    const bySku = new Map<string, any>(priced.map((p: any) => [String(p.sku), p]));

    const lines: { sku: string; name: string; qty: number; price: number; amount: number; unit: string }[] = [];
    const problems: string[] = [];
    for (const [sku, qty] of wanted) {
      const p = bySku.get(sku);
      const priceNum = Number(p?.price);
      if (!p || !Number.isFinite(priceNum) || priceNum <= 0 || priceNum > 100_000_000) { problems.push(`${sku}: no longer available`); continue; }
      if (p.stockLive !== false && Number(p.stock) < qty) { problems.push(`${p.name}: only ${Math.max(0, Number(p.stock) || 0)} left`); continue; }
      // stock feed down for this store → the store confirms; still cap the order size
      if (p.stockLive === false && qty > 20) { problems.push(`${p.name}: max 20 per order while stock is syncing`); continue; }
      const price = Math.round(priceNum);
      lines.push({ sku, name: String(p.name || sku), qty, price, amount: price * qty, unit: String(p.unit || "pcs") });
    }
    if (problems.length) {
      return NextResponse.json({ ok: false, error: `Some items need attention: ${problems.join("; ")}. Please review your basket.`, problems }, { status: 409 });
    }
    const subtotal = lines.reduce((n, l) => n + l.amount, 0);
    if (subtotal < 10000) return NextResponse.json({ ok: false, error: "Minimum order is Rp10.000." }, { status: 400 });

    // ---- delivery fee (server-computed) ----------------------------------
    let deliveryFee = 0;
    let address: string | null = null;
    let km: number | null = null;
    if (fulfil === "delivery") {
      address = String(b?.address || "").trim().slice(0, 500) || null;
      const lat = Number(b?.lat), lng = Number(b?.lng);
      if (!address || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return NextResponse.json({ ok: false, error: "Pick your delivery address from the suggestions." }, { status: 400 });
      }
      const kmRaw = haversineKm(geo, { lat, lng });
      km = Math.round(kmRaw * 10) / 10;
      if (kmRaw > TBS_DELIVERY_MAX_KM) {
        return NextResponse.json({ ok: false, error: `That address is ${km} km from ${geo.name} — outside the ${TBS_DELIVERY_MAX_KM} km delivery area. Choose pickup or a closer store.` }, { status: 400 });
      }
      deliveryFee = tbsDeliveryFee(km);
    }
    const total = subtotal + deliveryFee;
    if (!Number.isFinite(total) || total <= 0 || total > 100_000_000) {
      return NextResponse.json({ ok: false, error: "Order total looks wrong — please try again." }, { status: 400 });
    }

    // ---- create the order + charge --------------------------------------
    const supa = supaAdmin();
    const midtransOrderId = `TBS-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const items = lines.map((l) => ({ id: `tbs:${l.sku}`, name: l.name, quantity: l.qty, price: l.price, kind: "tbs", sku: l.sku, unit: l.unit }));

    const { data: order, error: e1 } = await supa
      .from("orders")
      .insert({
        customer_name: name,
        customer_phone: phone,
        address, shipping_address: address,
        notes,
        subtotal_idr: subtotal,
        shipping_cost_idr: deliveryFee,
        total_idr: total,
        midtrans_order_id: midtransOrderId,
        payment_status: "PENDING",
        shipment_status: "not_created",
        fulfilment_status: fulfil,
        items_json: items,
        meta: {
          source: "tbs",
          tbs: { store, storeName: geo.name, fulfil, address, km, delivery_fee: deliveryFee, pushed: false },
        },
      })
      .select("id")
      .maybeSingle();
    if (e1 || !order?.id) throw new Error(e1?.message || "Order insert failed");

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.cookiedoh.co.id").replace(/\/$/, "");
    const token = await createSnapToken({
      order_id: midtransOrderId,
      gross_amount: total,
      customer: { name, phone },
      itemsText: `TotalBuahStore ${fulfil} — ${lines.length} item${lines.length > 1 ? "s" : ""} @ ${geo.name}`,
      siteUrl,
      finishUrl: `${siteUrl}/tbs/success`,
    });

    return NextResponse.json({
      ok: true, order_id: order.id, snap_token: token,
      pricing: { lines, subtotal, delivery_fee: deliveryFee, km, total },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Checkout failed — please try again." }, { status: 200 });
  }
}
