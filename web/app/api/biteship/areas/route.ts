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

    // Biteship Maps Search Area API endpoint :contentReference[oaicite:1]{index=1}
    const url = `https://api.biteship.com/v1/maps/areas?countries=ID&input=${encodeURIComponent(
      input
    )}&type=single`;

    const resp = await fetch(url, {
      headers: {
        // IMPORTANT: Biteship expects the API key directly in "authorization" header (not Bearer) :contentReference[oaicite:2]{index=2}
        authorization: apiKey,
      },
      cache: "no-store",
    });

    const json = await resp.json();

    if (!resp.ok) {
      return NextResponse.json(
        { error: json?.message || json?.error || `Biteship error (${resp.status})`, raw: json },
        { status: resp.status }
      );
    }

    return NextResponse.json(json);
  } catch (e: any) {
    // Make fetch failures readable (DNS/TLS/etc.)
    const cause = e?.cause
      ? {
          name: e.cause.name,
          code: e.cause.code,
          message: e.cause.message,
        }
      : null;

    console.error("biteship areas fetch failed:", e, cause);

    return NextResponse.json(
      { error: "fetch failed", message: e?.message ?? String(e), cause },
      { status: 500 }
    );
  }
}
