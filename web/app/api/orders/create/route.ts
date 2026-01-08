import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type MidtransItem = { id: string; name: string; price: number; quantity: number };

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items: MidtransItem[] = Array.isArray(body?.items) ? body.items : [];

    if (!items.length) return NextResponse.json({ error: "No items" }, { status: 400 });

    const safeItems = items.map((it) => ({
      id: String(it.id),
      name: String(it.name),
      price: Math.max(0, Math.round(Number(it.price) || 0)),
      quantity: Math.max(1, Math.round(Number(it.quantity) || 1)),
    }));

    const amount = safeItems.reduce((s, it) => s + it.price * it.quantity, 0);
    if (amount <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });

    // Create a Midtrans order_id you can track end-to-end
    const midtrans_order_id = `CD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("orders")
      .insert({
        midtrans_order_id,
        amount,
        items_json: safeItems,
        customer_json: body?.customer ?? null,
        shipping_json: body?.shipping ?? null,
        midtrans_status: "created",
      })
      .select("id, midtrans_order_id, amount")
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
