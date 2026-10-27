// web/app/api/admin/orders/route.ts
 
import { NextResponse } from "next/server";
import { supaAdmin } from "@/lib/supaAdmin";

// data client → Cloud SQL (pg shim) via lib/supaAdmin; .auth still Supabase (P3).

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limitRaw = searchParams.get("limit");
    const limit = Math.min(Math.max(Number(limitRaw || "80") || 80, 1), 200);

    const sb = supaAdmin();

    const { data, error } = await sb
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ orders: data ?? [] });
  } catch (e: any) {
    console.error("ADMIN ORDERS ERROR", {
      supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      errorName: e?.name,
      errorMessage: e?.message,
      errorStack: e?.stack,
    });

    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}