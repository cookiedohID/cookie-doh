import type { NextApiRequest, NextApiResponse } from "next";
// web/app/api/checkout/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const orderId =
      payload?.orderId ||
      globalThis.crypto?.randomUUID?.() ||
      `order_${Date.now()}`;

    const redirect_url = `${siteUrl}/checkout/pending?order_id=${encodeURIComponent(
      orderId
    )}`;

    return NextResponse.json({
      ok: true,
      order_id: orderId,
      redirect_url,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Invalid request body" },
      { status: 400 }
    );
  }
}

// Optional: helpful message if someone visits /api/checkout directly
export async function GET() {
  return NextResponse.json(
    { ok: true, message: "Use POST /api/checkout" },
    { status: 200 }
  );
}
