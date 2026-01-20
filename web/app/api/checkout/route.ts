// web/app/api/checkout/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}
function mode() {
  return (process.env.NEXT_PUBLIC_CHECKOUT_MODE || "midtrans").toLowerCase();
}

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

function buildBoxesText(cart: any) {
  const boxes = cart?.boxes;
  if (!Array.isArray(boxes) || boxes.length === 0) return "";

  const out: string[] = [];
  boxes.forEach((b: any, idx: number) => {
    const size = b?.boxSize ?? "?";
    const total = Number(b?.total || 0);
    out.push(`Box ${idx + 1} (Box of ${size}) — Rp ${total.toLocaleString("id-ID")}`);

    const items = Array.isArray(b?.items) ? b.items : [];
    items.forEach((it: any) => {
      const name = (it?.name || it?.item_name || "Item").toString();
      const qty = Number(it?.quantity || 0);
      if (qty > 0) out.push(`- ${name} ×${qty}`);
    });

    out.push(""); // blank line between boxes
  });

  return out.join("\n").trim();
}

function normalizeItems(cart: any) {
  const boxes = cart?.boxes;
  if (!Array.isArray(boxes)) return [];
  const out: { name: string; quantity: number }[] = [];

  for (const b of boxes) {
    const items = Array.isArray(b?.items) ? b.items : [];
    for (const it of items) {
      const name = (it?.name || it?.item_name || "Item").toString();
      const qty = Number(it?.quantity || 0);
      if (qty > 0) out.push({ name, quantity: qty });
    }
  }
  return out;
}

function computeSubtotalFromCart(cart: any) {
  const boxes = cart?.boxes;
  if (!Array.isArray(boxes)) return 0;
  return boxes.reduce((s: number, b: any) => s + (Number(b?.total) || 0), 0);
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const siteUrl = getSiteUrl();
    const supabase = supaAdmin();

    const customerName = (payload?.customer?.name || "").toString();
    const customerPhone = (payload?.customer?.phone || "").toString();
    const email = (payload?.customer?.email || payload?.email || "").toString();

    const shippingAddress = (payload?.delivery?.address || payload?.shipping_address || "").toString();
    const buildingName = (payload?.delivery?.buildingName || payload?.building_name || "").toString();
    const destinationAreaId = (payload?.delivery?.destination_area_id || payload?.destination_area_id || "").toString();
    const destinationAreaLabel = (payload?.delivery?.destination_area_label || payload?.destination_area_label || "").toString();

    const city = (payload?.delivery?.city || payload?.city || "").toString();
    const postal = (payload?.delivery?.postal || payload?.delivery?.postalCode || payload?.postal || "").toString();
    const notes = (payload?.notes || "").toString();

    const cart = payload?.cart;
    const items = normalizeItems(cart);
    const boxesText = buildBoxesText(cart);

    const subtotal = Number(payload?.subtotal_idr ?? payload?.subtotal ?? computeSubtotalFromCart(cart)) || 0;
    const shippingCost = Number(payload?.shipping_cost_idr ?? payload?.shipping_cost ?? 0) || 0;
    const totalIdr = Number(payload?.total_idr ?? payload?.total ?? (subtotal + shippingCost)) || 0;

    const checkoutMode = mode();

    const orderInsert: any = {
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      email: email || null,

      address: shippingAddress || null,
      shipping_address: shippingAddress || null,
      building_name: buildingName || null,

      city: city || null,
      postal: postal || null,
      notes: notes || null,

      destination_area_id: destinationAreaId || null,
      destination_area_label: destinationAreaLabel || null,

      subtotal_idr: subtotal || null,
      shipping_cost_idr: shippingCost || null,
      total_idr: totalIdr || null,

      payment_status: "PENDING",
      shipment_status: "not_created",
      fullfillment_status: payload?.fullfillment_status || null,

      checkout_mode: checkoutMode,
      items_json: items,
      customer_json: payload?.customer || null,
      shipping_json: payload?.delivery || null,
      meta: payload?.meta || null,
    };

    const { data: orderRow, error: e1 } = await supabase
      .from("orders")
      .insert(orderInsert)
      .select("id, order_no, total_idr, shipping_address, building_name, postal, customer_name, customer_phone")
      .maybeSingle();

    if (e1) throw e1;
    if (!orderRow?.id) throw new Error("Order insert failed (missing id)");

    // order_items
    if (items.length > 0) {
      const rows = items.map((it) => ({
        order_id: orderRow.id,
        item_name: it.name,
        quantity: it.quantity,
      }));

      const { error: e2 } = await supabase.from("order_items").insert(rows);
      if (e2) throw e2;
    }

    if (checkoutMode === "manual") {
      const u = new URL(`${siteUrl}/checkout/pending`);
      u.searchParams.set("order_id", orderRow.id);
      u.searchParams.set("total", String(orderRow.total_idr || totalIdr || 0));
      u.searchParams.set("name", orderRow.customer_name || customerName || "");
      u.searchParams.set("phone", orderRow.customer_phone || customerPhone || "");
      u.searchParams.set("address", orderRow.shipping_address || shippingAddress || "");
      u.searchParams.set("building", orderRow.building_name || buildingName || "");
      u.searchParams.set("postal", orderRow.postal || postal || "");

      // ✅ per-box block
      u.searchParams.set("boxes", boxesText);

      return NextResponse.json({
        ok: true,
        mode: "manual",
        order_id: orderRow.id,
        order_no: orderRow.order_no,
        redirect_url: u.toString(),
      });
    }

    return NextResponse.json(
      {
        ok: false,
        mode: "midtrans",
        error: "Midtrans flow not wired in /api/checkout yet, but order has been created.",
        order_id: orderRow.id,
        order_no: orderRow.order_no,
      },
      { status: 500 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Invalid request body" }, { status: 400 });
  }
}



/*
// web/app/api/checkout/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}
function mode() {
  return (process.env.NEXT_PUBLIC_CHECKOUT_MODE || "midtrans").toLowerCase();
}

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Flatten cart -> items list
function normalizeItems(cart: any) {
  const boxes = cart?.boxes;
  if (!Array.isArray(boxes)) return [];
  const out: { name: string; quantity: number }[] = [];

  for (const b of boxes) {
    const items = Array.isArray(b?.items) ? b.items : [];
    for (const it of items) {
      const name = (it?.name || it?.item_name || "Item").toString();
      const qty = Number(it?.quantity || 0);
      if (qty > 0) out.push({ name, quantity: qty });
    }
  }
  return out;
}

function buildItemLines(items: { name: string; quantity: number }[]) {
  return items.map((it) => `- ${it.name} ×${it.quantity}`).join("\n");
}

function computeSubtotalFromCart(cart: any) {
  const boxes = cart?.boxes;
  if (!Array.isArray(boxes)) return 0;
  return boxes.reduce((s: number, b: any) => s + (Number(b?.total) || 0), 0);
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const siteUrl = getSiteUrl();
    const supabase = supaAdmin();

    // --- Core inputs
    const customerName = (payload?.customer?.name || "").toString();
    const customerPhone = (payload?.customer?.phone || "").toString();
    const email = (payload?.customer?.email || payload?.email || "").toString();

    // Delivery fields (align to your schema)
    const shippingAddress = (payload?.delivery?.address || payload?.shipping_address || "").toString();
    const buildingName = (payload?.delivery?.buildingName || payload?.building_name || "").toString();
    const destinationAreaId = (payload?.delivery?.destination_area_id || payload?.destination_area_id || "").toString();
    const destinationAreaLabel = (payload?.delivery?.destination_area_label || payload?.destination_area_label || "").toString();

    const city = (payload?.delivery?.city || payload?.city || "").toString();
    const postal = (payload?.delivery?.postal || payload?.delivery?.postalCode || payload?.postal || "").toString();
    const notes = (payload?.notes || "").toString();

    const cart = payload?.cart;
    const items = normalizeItems(cart);

    // Totals
    const subtotal = Number(payload?.subtotal_idr ?? payload?.subtotal ?? computeSubtotalFromCart(cart) ?? 0) || 0;
    const shippingCost = Number(payload?.shipping_cost_idr ?? payload?.shipping_cost ?? 0) || 0;
    const totalIdr = Number(payload?.total_idr ?? payload?.total ?? (subtotal + shippingCost)) || 0;


    // Order id: let DB generate uuid. We'll store order_no from DB.
    // But we still want a stable "orderId" in redirect: use the DB uuid after insert.
    const checkoutMode = mode();

    // --- Insert order row
    const orderInsert: any = {
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      email: email || null,

      // keep both (your table has address + shipping_address)
      address: shippingAddress || null,
      shipping_address: shippingAddress || null,
      building_name: buildingName || null,

      city: city || null,
      postal: postal || null,
      notes: notes || null,

      destination_area_id: destinationAreaId || null,
      destination_area_label: destinationAreaLabel || null,

      subtotal_idr: subtotal || null,
      shipping_cost_idr: shippingCost || null,
      total_idr: totalIdr || null,

      payment_status: "PENDING",
      shipment_status: "not_created",
      fullfillment_status: payload?.fullfillment_status || null,

      checkout_mode: checkoutMode,
      items_json: items, // jsonb
      customer_json: payload?.customer || null,
      shipping_json: payload?.delivery || null,
      meta: payload?.meta || null,
    };

    const { data: orderRow, error: e1 } = await supabase
      .from("orders")
      .insert(orderInsert)
      .select("id, order_no, total_idr, shipping_address, building_name, postal, destination_area_label, destination_area_id, customer_name, customer_phone")
      .maybeSingle();

    if (e1) throw e1;
    if (!orderRow?.id) throw new Error("Order insert failed (missing id)");

    // --- Insert order_items (if table exists)
    // Columns assumed: order_id (uuid), item_name (text), quantity (int)
    if (items.length > 0) {
      const rows = items.map((it) => ({
        order_id: orderRow.id,
        item_name: it.name,
        quantity: it.quantity,
      }));

      const { error: e2 } = await supabase.from("order_items").insert(rows);
      if (e2) throw e2;
    }

    // --- Manual mode redirect to pending with full details for WA
    if (checkoutMode === "manual") {
      const u = new URL(`${siteUrl}/checkout/pending`);
      u.searchParams.set("order_id", orderRow.id);
      u.searchParams.set("total", String(orderRow.total_idr || totalIdr || 0));
      u.searchParams.set("name", orderRow.customer_name || customerName || "");
      u.searchParams.set("phone", orderRow.customer_phone || customerPhone || "");
      u.searchParams.set("address", orderRow.shipping_address || shippingAddress || "");
      u.searchParams.set("building", orderRow.building_name || buildingName || "");
      u.searchParams.set("postal", orderRow.postal || postal || "");
      u.searchParams.set("items", buildItemLines(items));

      return NextResponse.json({
        ok: true,
        mode: "manual",
        order_id: orderRow.id,
        order_no: orderRow.order_no,
        redirect_url: u.toString(),
      });
    }

    // --- Midtrans mode placeholder (keep your future Midtrans flow here)
    return NextResponse.json(
      {
        ok: false,
        mode: "midtrans",
        error: "Midtrans flow not wired in /api/checkout yet, but order has been created.",
        order_id: orderRow.id,
        order_no: orderRow.order_no,
      },
      { status: 500 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Invalid request body" }, { status: 400 });
  }
}
*/

/*

// web/app/api/checkout/route.ts
import { NextResponse } from "next/server";

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}
function mode() {
  return (process.env.NEXT_PUBLIC_CHECKOUT_MODE || "midtrans").toLowerCase();
}

function buildItemLines(cart: any) {
  try {
    const boxes = cart?.boxes;
    if (!Array.isArray(boxes)) return "";
    const lines: string[] = [];
    for (const b of boxes) {
      const items = Array.isArray(b?.items) ? b.items : [];
      for (const it of items) {
        const name = it?.name || it?.item_name || "Item";
        const qty = Number(it?.quantity || 0);
        if (qty > 0) lines.push(`- ${name} ×${qty}`);
      }
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const siteUrl = getSiteUrl();

    const orderId =
      payload?.orderId ||
      globalThis.crypto?.randomUUID?.() ||
      `order_${Date.now()}`;

    const customerName = payload?.customer?.name || "";
    const customerPhone = payload?.customer?.phone || "";

    const address = payload?.delivery?.address || "";
    const building = payload?.delivery?.buildingName || "";
    const postal = payload?.delivery?.postalCode || "";
    const total =
      typeof payload?.total === "number"
        ? payload.total
        : Array.isArray(payload?.cart?.boxes)
          ? payload.cart.boxes.reduce((s: number, b: any) => s + (Number(b?.total) || 0), 0)
          : 0;

    // MANUAL MODE: go to pending with full WA payload
    if (mode() === "manual") {
      const u = new URL(`${siteUrl}/checkout/pending`);
      u.searchParams.set("order_id", orderId);
      u.searchParams.set("total", String(total || 0));
      u.searchParams.set("name", customerName);
      u.searchParams.set("phone", customerPhone);
      u.searchParams.set("address", address);
      u.searchParams.set("building", building);
      u.searchParams.set("postal", postal);
      u.searchParams.set("items", buildItemLines(payload?.cart));

      return NextResponse.json({
        ok: true,
        mode: "manual",
        order_id: orderId,
        redirect_url: u.toString(),
      });
    }

    // MIDTRANS MODE:
    // Keep your existing Midtrans create flow here (not deleting).
    // For now, return a clear error if Midtrans path not wired in this route.
    return NextResponse.json(
      { ok: false, mode: "midtrans", error: "Midtrans flow not wired in /api/checkout yet." },
      { status: 500 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Invalid request body" },
      { status: 400 }
    );
  }
}


*/

/* 

// web/app/api/checkout/route.ts
import { NextResponse } from "next/server";

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

function mode() {
  return (process.env.NEXT_PUBLIC_CHECKOUT_MODE || "midtrans").toLowerCase();
}

/**
 * In MANUAL mode:
 * - We return redirect to /checkout/pending with query params for WhatsApp auto-message.
 *
 * In MIDTRANS mode:
 * - We expect your real Midtrans logic to exist somewhere server-side.
 * - If you already have an internal endpoint for creating Midtrans transactions,
 *   set CHECKOUT_MIDTRANS_CREATE_URL to that URL (server-only).
 * - Otherwise we return an error telling you what’s missing (instead of fake pending).
 */


/*

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const siteUrl = getSiteUrl();

    const orderId =
      payload?.orderId ||
      globalThis.crypto?.randomUUID?.() ||
      `order_${Date.now()}`;

    // Basic info (best-effort)
    const customerName = payload?.customer?.name || payload?.name || "";
    const customerPhone = payload?.customer?.phone || payload?.phone || "";
    const address = payload?.delivery?.address || payload?.address || "";
    const building = payload?.delivery?.buildingName || payload?.delivery?.building || payload?.buildingName || "";
    const postal = payload?.delivery?.postalCode || payload?.delivery?.postal || payload?.postalCode || "";
    const total =
      typeof payload?.total === "number"
        ? payload.total
        : // fallback: sum of box totals if present
          Array.isArray(payload?.cart?.boxes)
          ? payload.cart.boxes.reduce((s: number, b: any) => s + (Number(b?.total) || 0), 0)
          : 0;

    // ---- MANUAL MODE (fallback while Midtrans pending/verification)
    if (mode() === "manual") {
      const u = new URL(`${siteUrl}/checkout/pending`);
      u.searchParams.set("order_id", orderId);
      if (total) u.searchParams.set("total", String(total));
      if (customerName) u.searchParams.set("name", String(customerName));
      if (customerPhone) u.searchParams.set("phone", String(customerPhone));
      if (address) u.searchParams.set("address", String(address));
      if (building) u.searchParams.set("building", String(building));
      if (postal) u.searchParams.set("postal", String(postal));

      return NextResponse.json({
        ok: true,
        mode: "manual",
        order_id: orderId,
        redirect_url: u.toString(),
      });
    }

    // ---- MIDTRANS MODE (primary)
    // If you already have server code to create Midtrans transactions, call it here.
    // To minimize deleting your work, we allow you to point to it via env.
    const createUrl = process.env.CHECKOUT_MIDTRANS_CREATE_URL || "";

    if (!createUrl) {
      return NextResponse.json(
        {
          ok: false,
          mode: "midtrans",
          error:
            "Midtrans mode is enabled but CHECKOUT_MIDTRANS_CREATE_URL is not set. Set NEXT_PUBLIC_CHECKOUT_MODE=manual for now, or configure Midtrans create endpoint.",
        },
        { status: 500 }
      );
    }

    // Forward payload to your existing Midtrans transaction creator
    const res = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, orderId }),
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          mode: "midtrans",
          error: `Midtrans create failed (HTTP ${res.status}): ${text || "no details"}`,
        },
        { status: 500 }
      );
    }

    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      // if it wasn't json, treat as error
      return NextResponse.json(
        {
          ok: false,
          mode: "midtrans",
          error: `Midtrans create returned non-JSON: ${text.slice(0, 300)}`,
        },
        { status: 500 }
      );
    }

    const redirectUrl = data?.redirect_url || data?.redirectUrl;
    if (!redirectUrl) {
      return NextResponse.json(
        {
          ok: false,
          mode: "midtrans",
          error: `Missing redirect_url from Midtrans create response: ${JSON.stringify(data)}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      mode: "midtrans",
      order_id: orderId,
      redirect_url: redirectUrl,
      // pass through if your creator returns snap_token
      snap_token: data?.snap_token || data?.token || undefined,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Invalid request body" },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: true, message: "Use POST /api/checkout" },
    { status: 200 }
  );
}
*/