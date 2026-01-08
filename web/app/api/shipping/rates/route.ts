import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function toPostalCode(v: any): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

export async function POST(req: NextRequest) {
  try {
    const BITESHIP_API_KEY = getEnv("BITESHIP_API_KEY");
    const origin_postal_code = toPostalCode(getEnv("BITESHIP_ORIGIN_POSTAL_CODE"));

    if (!origin_postal_code) {
      return NextResponse.json(
        { ok: false, error: "Invalid BITESHIP_ORIGIN_POSTAL_CODE" },
        { status: 500 }
      );
    }

    const body = await req.json();

    const destination_postal_code =
      toPostalCode(body?.destination_postal_code) ??
      toPostalCode(body?.destinationPostalCode) ??
      toPostalCode(body?.postal);

    if (!destination_postal_code) {
      return NextResponse.json(
        { ok: false, error: "Missing/invalid destination_postal_code" },
        { status: 400 }
      );
    }

    let couriers = "jne,jnt,sicepat,anteraja,ninja";
    if (typeof body?.couriers === "string") {
      const trimmed = body.couriers.trim();
      if (trimmed) couriers = trimmed;
    } else if (typeof body?.courier_preference === "string") {
      const trimmed = body.courier_preference.trim();
      if (trimmed) couriers = trimmed;
    }

    const weight = Number(body?.weight ?? 1000);
    const value = Number(body?.value ?? 100000);

    const payload = {
      origin_postal_code,
      destination_postal_code,
      couriers,
      items: body?.items ?? [
        {
          name: "Cookie Box",
          description: "Cookie Doh",
          quantity: 1,
          value,
          weight,
        },
      ],
    };

    const res = await fetch("https://api.biteship.com/v1/rates/couriers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BITESHIP_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, status: res.status, error: data?.error ?? data },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      origin_postal_code,
      destination_postal_code,
      couriers,
      data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
