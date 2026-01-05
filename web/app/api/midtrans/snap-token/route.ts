import { NextResponse } from "next/server";
import midtransClient from "midtrans-client";

export const runtime = "nodejs"; // important: midtrans client runs on node runtime

type Item = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Expecting: { items: Item[], customer?: { first_name, last_name, email, phone } }
    const items: Item[] = Array.isArray(body?.items) ? body.items : [];

    if (!items.length) {
      return NextResponse.json({ error: "No items" }, { status: 400 });
    }

    // IMPORTANT: In production, do NOT trust client price.
    // You should re-price items from your server-side product list / DB.
    const gross_amount = items.reduce((sum, it) => sum + it.price * it.quantity, 0);

    // Generate unique order_id
    const order_id = `CD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const snap = new midtransClient.Snap({
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
      serverKey: process.env.MIDTRANS_SERVER_KEY as string,
    });

    const parameter = {
      transaction_details: {
        order_id,
        gross_amount,
      },
      item_details: items.map((it) => ({
        id: it.id,
        name: it.name,
        price: it.price,
        quantity: it.quantity,
      })),
      customer_details: body?.customer ?? undefined,
    };

    // You can use createTransaction (returns token + redirect_url)
    const transaction = await snap.createTransaction(parameter);

    return NextResponse.json({
      order_id,
      token: transaction.token,
      redirect_url: transaction.redirect_url,
    });
  } catch (err: any) {
    console.error("snap-token error:", err);
    return NextResponse.json({ error: "Failed to create token" }, { status: 500 });
  }
}
