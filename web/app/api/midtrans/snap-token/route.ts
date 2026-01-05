import { NextResponse } from "next/server";
import midtransClient from "midtrans-client";

export const runtime = "nodejs";

type Item = {
  id: string;
  name: string;
  price: number; // IDR integer
  quantity: number;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const items: Item[] = Array.isArray(body?.items) ? body.items : [];

    if (!process.env.MIDTRANS_SERVER_KEY) {
      return NextResponse.json(
        { error: "Missing MIDTRANS_SERVER_KEY env var" },
        { status: 500 }
      );
    }

    if (!items.length) {
      return NextResponse.json({ error: "No items" }, { status: 400 });
    }

    // sanitize items (Midtrans expects integers)
    const safeItems = items.map((it) => ({
      id: String(it.id),
      name: String(it.name).slice(0, 50), // Midtrans has name length limits; keep safe
      price: Math.max(0, Math.round(Number(it.price) || 0)),
      quantity: Math.max(1, Math.round(Number(it.quantity) || 1)),
    }));

    const gross_amount = safeItems.reduce(
      (sum, it) => sum + it.price * it.quantity,
      0
    );

    if (gross_amount <= 0) {
      return NextResponse.json(
        { error: "Invalid gross_amount (must be > 0)" },
        { status: 400 }
      );
    }

    const order_id = `CD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const snap = new midtransClient.Snap({
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
      serverKey: process.env.MIDTRANS_SERVER_KEY,
    });

    const parameter = {
      transaction_details: {
        order_id,
        gross_amount,
      },
      item_details: safeItems,
      customer_details: body?.customer ?? undefined,
    };

    const transaction = await snap.createTransaction(parameter);

    return NextResponse.json({
      order_id,
      token: transaction.token,
      redirect_url: transaction.redirect_url,
    });
  } catch (err: any) {
    console.error("snap-token error:", err);

    // midtrans-client sometimes nests errors
    const message =
      err?.message ||
      err?.ApiResponse?.status_message ||
      err?.status_message ||
      String(err);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
