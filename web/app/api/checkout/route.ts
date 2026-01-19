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