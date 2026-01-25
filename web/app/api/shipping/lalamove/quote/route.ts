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
  phone?: string;
};

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

function clampSpeed(raw: string): "instant" | "sameday" {
  const s = (raw || "").toLowerCase();
  return s === "sameday" ? "sameday" : "instant";
}

function distanceKmRounded(km: number) {
  if (!Number.isFinite(km)) return null;
  return Math.round(km * 10) / 10;
}

function etaHint(speed: "instant" | "sameday") {
  if (speed === "sameday") return "Same-day window: 08:00–22:00";
  return "Instant slots: 10:00–15:00 or 15:00–18:00";
}

function buildPointsFromEnv(): Point[] {
  const candidates: Point[] = [
    {
      id: "kemang",
      name: process.env.LALAMOVE_PICKUP_NAME || "Cookie Doh",
      phone: process.env.LALAMOVE_PICKUP_PHONE || undefined,
      address: process.env.LALAMOVE_PICKUP_ADDRESS || "",
      lat: Number(process.env.LALAMOVE_PICKUP_LAT),
      lng: Number(process.env.LALAMOVE_PICKUP_LNG),
    },
    {
      id: "tbs-rcv",
      name: process.env.LALAMOVE_RCV_PICKUP_NAME || "Total Buah Segar - RCV",
      phone: process.env.LALAMOVE_RCV_PICKUP_PHONE || undefined,
      address: process.env.LALAMOVE_RCV_PICKUP_ADDRESS || "",
      lat: Number(process.env.LALAMOVE_RCV_PICKUP_LAT),
      lng: Number(process.env.LALAMOVE_RCV_PICKUP_LNG),
    },
    {
      id: "tbs-xmas",
      name: process.env.LALAMOVE_XMAS_PICKUP_NAME || "Total Buah Segar - KH Noer Ali (Bekasi)",
      phone: process.env.LALAMOVE_XMAS_PICKUP_PHONE || undefined,
      address: process.env.LALAMOVE_XMAS_PICKUP_ADDRESS || "",
      lat: Number(process.env.LALAMOVE_XMAS_PICKUP_LAT),
      lng: Number(process.env.LALAMOVE_XMAS_PICKUP_LNG),
    },
    {
      id: "tbs-ktr",
      name: process.env.LALAMOVE_KTR_PICKUP_NAME || "Total Buah Segar - Karang Tengah Raya (Lebak Bulus)",
      phone: process.env.LALAMOVE_KTR_PICKUP_PHONE || undefined,
      address: process.env.LALAMOVE_KTR_PICKUP_ADDRESS || "",
      lat: Number(process.env.LALAMOVE_KTR_PICKUP_LAT),
      lng: Number(process.env.LALAMOVE_KTR_PICKUP_LNG),
    },
  ];

  // keep only valid points
  return candidates.filter(
    (p) =>
      p.id &&
      p.name &&
      p.address &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng)
  );
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const quoteAt = new Date().toISOString();

  try {
    const body = await req.json().catch(() => ({} as any));
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    const speed = clampSpeed(String(body?.speed || "instant"));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { ok: false, error: "Missing/invalid destination lat/lng", requestId },
        { status: 400 }
      );
    }

    const points = buildPointsFromEnv();
    if (!points.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No pickup points configured (missing LALAMOVE_*_PICKUP_* envs).",
          requestId,
        },
        { status: 500 }
      );
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
        {
          ok: false,
          error:
            "Missing Lalamove service key env (LALAMOVE_SERVICE_INSTANT_PRIORITY / LALAMOVE_SERVICE_SAMEDAY_POOLING)",
          requestId,
        },
        { status: 500 }
      );
    }

    const env = (process.env.LALAMOVE_ENV || "production") as "sandbox" | "production";
    const apiKey = process.env.LALAMOVE_API_KEY || "";
    const apiSecret = process.env.LALAMOVE_API_SECRET || "";
    const market = process.env.LALAMOVE_MARKET || "ID";

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { ok: false, error: "Missing Lalamove credentials", requestId },
        { status: 500 }
      );
    }

    const quotationRes = await lalamoveRequest<any>({
      env,
      apiKey,
      apiSecret,
      market,
      method: "POST",
      path: "/v3/quotations",
      requestId,
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
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid quote price from Lalamove",
          requestId,
          quoteAt,
          provider: "lalamove",
        },
        { status: 500 }
      );
    }

    const roundedPrice = ceilToThousand(rawPrice);

    return NextResponse.json({
      ok: true,
      requestId,
      quoteAt,

      provider: "lalamove",
      providerLabel: "Lalamove",
      speed,
      serviceType,

      liveQuoteLabel: `Live quote (Lalamove) • ${speed === "sameday" ? "Same-day" : "Instant"}`,
      etaHint: etaHint(speed),

      origin: {
        id: best.id,
        name: best.name,
        address: best.address,
        lat: best.lat,
        lng: best.lng,
      },
      originDistanceKm: bestD,
      distanceKm: distanceKmRounded(bestD),

      rawPrice,
      price: roundedPrice,
      currency: "IDR",
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "Quote failed",
        requestId,
        quoteAt,
        provider: "lalamove",
      },
      { status: 500 }
    );
  }
}
