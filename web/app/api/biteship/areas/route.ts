import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const input = (searchParams.get("input") || "").trim();

    if (input.length < 3) return NextResponse.json({ areas: [] });

    const apiKey = process.env.BITESHIP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing BITESHIP_API_KEY" }, { status: 500 });
    }

    const isStaging = process.env.BITESHIP_IS_STAGING === "true";
    const base = isStaging ? "https://api-stg.biteship.com" : "https://api.biteship.com";

    const url = `${base}/v1/maps/areas?countries=ID&input=${encodeURIComponent(input)}&type=single`;

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });

    const json = await resp.json();
    if (!resp.ok) {
      return NextResponse.json(
        { error: json?.message || json?.error || "Biteship maps error" },
        { status: resp.status }
      );
    }

    return NextResponse.json(json);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
