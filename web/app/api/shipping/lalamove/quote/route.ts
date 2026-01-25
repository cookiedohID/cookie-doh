import { NextResponse } from "next/server";
import crypto from "crypto";
import { lalamoveRequest } from "@/lib/lalamove";

export const runtime = "nodejs";

type Point = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

function parsePoints(raw: string | undefined): Point[] {
  try {
    const arr = JSON.parse(raw || "[]");
    if (!Array.isArray(arr)) return [];
    return arr
      .map((p: any) => ({
        id: String(p.id || ""),
        name: String(p.name || ""),
        address: String(p.address || ""),
        lat: Number(p.lat),
        lng: Number(p.lng),
      }))
      .filter((p: Point) => p.id && p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  } catch {
    return [];
  }
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function ceilToThousand(n: number) {
  return Math.ceil(n / 1000) * 1000;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    const speed = String(body?.speed || "instant"); // "instant" | "sameday"

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ ok: false, error: "Missing/invalid destination lat/lng" }, { status: 400 });
    }

    const points = parsePoints(process.env.COOKIE_DOH_PICKUP_POINTS_JSON);
    if (!points.length) {
      return NextResponse.json({ ok: false, error: "No pickup points configured (COOKIE_DOH_PICKUP_POINTS_JSON)" }, { status: 500 });
    }

    const dest = { lat, lng };
    let best = points[0];
    let bestD = haversineKm(best, dest);

    for (const p of points.slice(1)) {
      const d = haversineKm(p, dest);
      if (d < bestD) {
        best = p;
        bestD = d;
      }
    }

    const serviceType =
      speed === "sameday"
        ? process.env.LALAMOVE_SERVICE_SAMEDAY_POOLING
        : process.env.LALAMOVE_SERVICE_INSTANT_PRIORITY;

    if (!serviceType) {
      return NextResponse.json(
        { ok: false, error: "Missing Lalamove service key env (LALAMOVE_SERVICE_INSTANT_PRIORITY / LALAMOVE_SERVICE_SAMEDAY_POOLING)" },
        { status: 500 }
      );
    }

    const env = (process.env.LALAMOVE_ENV || "production") as "sandbox" | "production";
    const apiKey = process.env.LALAMOVE_API_KEY || "";
    const apiSecret = process.env.LALAMOVE_API_SECRET || "";
    const market = process.env.LALAMOVE_MARKET || "ID";

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ ok: false, error: "Missing Lalamove credentials" }, { status: 500 });
    }

    // Quotation (minimal payload; safe across markets)
    const quotationRes = await lalamoveRequest<any>({
      env,
      apiKey,
      apiSecret,
      market,
      method: "POST",
      path: "/v3/quotations",
      requestId: crypto.randomUUID(),
      body: {
        data: {
          language: "id_ID",
          serviceType,
          stops: [
            {
              coordinates: { lat: String(best.lat), lng: String(best.lng) },
              address: best.address,
            },
            {
              coordinates: { lat: String(lat), lng: String(lng) },
              address: "Customer",
            },
          ],
        },
      },
    });

    const rawPrice = Number(quotationRes?.data?.priceBreakdown?.total);
    if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid quote price from Lalamove", lalamove: quotationRes }, { status: 500 });
    }

    const roundedPrice = ceilToThousand(rawPrice);

    return NextResponse.json({
      ok: true,
      provider: "lalamove",
      speed,
      serviceType,
      origin: best,
      originDistanceKm: bestD,
      rawPrice,
      price: roundedPrice,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Quote failed", lalamove: e?.payload || null }, { status: 500 });
  }
}
