import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { lalamoveRequest } from "@/lib/lalamove";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    const env = (process.env.LALAMOVE_ENV || "sandbox") as "sandbox" | "production";
    const apiKey = process.env.LALAMOVE_API_KEY || "";
    const apiSecret = process.env.LALAMOVE_API_SECRET || "";
    const market = process.env.LALAMOVE_MARKET || "ID";

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "Missing Lalamove credentials" }, { status: 500 });
    }

    const data = await lalamoveRequest<{ data: any[] }>({
      env,
      apiKey,
      apiSecret,
      market,
      method: "GET",
      path: "/v3/cities",
      requestId: crypto.randomUUID(),
    });

    return NextResponse.json({ ok: true, cities: data.data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed", lalamove: e?.payload || null, status: e?.status || null },
      { status: 500 }
    );
  }
}
