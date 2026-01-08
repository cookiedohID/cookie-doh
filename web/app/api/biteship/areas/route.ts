import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const apiKey = process.env.BITESHIP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing BITESHIP_API_KEY" }, { status: 500 });
    }

    const url = new URL(req.url);
    const input = (url.searchParams.get("input") ?? url.searchParams.get("q") ?? "").trim();

    if (!input) return NextResponse.json({ areas: [] });

    const upstream = new URL("https://api.biteship.com/v1/maps/areas");
    upstream.searchParams.set("countries", "ID");
    upstream.searchParams.set("input", input);
    upstream.searchParams.set("type", "single");

    const resp = await fetch(upstream.toString(), {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
    });

    const json = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return NextResponse.json(
        { error: "Biteship upstream error", status: resp.status, upstream: json },
        { status: 502 }
      );
    }

    // normalize
    const areas = Array.isArray(json?.areas) ? json.areas : Array.isArray(json) ? json : [];
    return NextResponse.json({ areas });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
