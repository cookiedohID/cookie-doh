// web/lib/lalamove.ts
import crypto from "crypto";

type LalamoveEnv = "sandbox" | "production";

type Stop = {
  coordinates: { lat: string; lng: string };
  address: string;
};

type NestedStop = {
  address: string;
  lat: number;
  lng: number;
  contactName: string;
  contactPhone: string; // "+62..."
  remarks?: string;
};

export type CreateLalamoveOrderInput = {
  // ✅ Backwards-compatible (your shipments/create route may use these)
  externalId?: string;

  pickupAddress?: string;
  pickupLat?: number;
  pickupLng?: number;
  pickupContactName?: string;
  pickupContactPhone?: string;

  dropoffAddress?: string;
  dropoffLat?: number;
  dropoffLng?: number;

  // old naming variants
  dropoffContactName?: string;
  dropoffContactPhone?: string;
  dropoffRemarks?: string;

  // ✅ fields your route uses
  recipientName?: string;
  recipientPhone?: string;
  remarks?: string;

  // optional variants
  senderName?: string;
  senderPhone?: string;

  // ✅ New preferred nested shape (admin page can use this)
  pickup?: NestedStop;
  dropoff?: NestedStop;

  // ✅ IMPORTANT: make optional to satisfy your current route call
  serviceType?: string; // default to "MOTORCYCLE"

  language?: string; // default "id_ID"
  scheduleAt?: string; // ISO string optional
  isPODEnabled?: boolean;
  metadata?: Record<string, any>;
};

export type CreateLalamoveOrderResult = {
  quotationId: string;
  orderId: string | null;
  shareLink: string | null;
  status: string | null;
  priceBreakdown: any | null;
  expiresAt: string | null;
};

function baseUrl(env: LalamoveEnv) {
  return env === "production"
    ? "https://rest.lalamove.com"
    : "https://rest.sandbox.lalamove.com";
}

// --- Signature + headers ---
export function lalamoveHeaders(opts: {
  apiKey: string;
  apiSecret: string;
  market: string; // "ID"
  method: string;
  path: string; // e.g. "/v3/quotations"
  body?: string; // JSON string
  requestId: string; // UUID
}) {
  const time = Date.now().toString();
  const method = opts.method.toUpperCase();
  const body = opts.body ?? "";

  const rawSignature =
    method === "GET"
      ? `${time}\r\n${method}\r\n${opts.path}\r\n\r\n`
      : `${time}\r\n${method}\r\n${opts.path}\r\n\r\n${body}`;

  const signature = crypto
    .createHmac("sha256", opts.apiSecret)
    .update(rawSignature)
    .digest("hex");

  const token = `${opts.apiKey}:${time}:${signature}`;

  return {
    "Content-Type": "application/json",
    Authorization: `hmac ${token}`,
    Market: opts.market,
    "Request-ID": opts.requestId,
  } as const;
}

export async function lalamoveRequest<T>(opts: {
  env: LalamoveEnv;
  apiKey: string;
  apiSecret: string;
  market: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string; // must include /v3/...
  requestId: string;
  body?: any;
}) {
  const url = `${baseUrl(opts.env)}${opts.path}`;
  const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;

  const headers = lalamoveHeaders({
    apiKey: opts.apiKey,
    apiSecret: opts.apiSecret,
    market: opts.market,
    method: opts.method,
    path: opts.path,
    body: bodyStr,
    requestId: opts.requestId,
  });

  console.log("[LALAMOVE]", {
    env: opts.env,
    url,
    market: opts.market,
    method: opts.method,
    path: opts.path,
    requestId: opts.requestId,
    hasKey: !!opts.apiKey,
    hasSecret: !!opts.apiSecret,
  });


  const res = await fetch(url, {
    method: opts.method,
    headers,
    body: bodyStr,
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      json?.message ||
      json?.error ||
      `Lalamove request failed (${res.status})`;
    const err = new Error(msg);
    (err as any).status = res.status;
    (err as any).payload = json;
    throw err;
  }

  return json as T;
}

// ✅ Normalize input: supports BOTH nested + flat formats
function normalizeStops(input: CreateLalamoveOrderInput): {
  pickup: NestedStop;
  dropoff: NestedStop;
} {
  // Preferred nested
  if (input.pickup && input.dropoff) return { pickup: input.pickup, dropoff: input.dropoff };

  const pickupName = input.pickupContactName || input.senderName || "";
  const pickupPhone = input.pickupContactPhone || input.senderPhone || "";

  const dropoffName = input.dropoffContactName || input.recipientName || "";
  const dropoffPhone = input.dropoffContactPhone || input.recipientPhone || "";
  const dropoffRemarks = input.dropoffRemarks || input.remarks || "";

  const pickup: NestedStop = {
    address: String(input.pickupAddress || ""),
    lat: Number(input.pickupLat),
    lng: Number(input.pickupLng),
    contactName: String(pickupName),
    contactPhone: String(pickupPhone),
  };

  const dropoff: NestedStop = {
    address: String(input.dropoffAddress || ""),
    lat: Number(input.dropoffLat),
    lng: Number(input.dropoffLng),
    contactName: String(dropoffName),
    contactPhone: String(dropoffPhone),
    remarks: String(dropoffRemarks || ""),
  };

  return { pickup, dropoff };
}

function assertStop(s: NestedStop, label: "pickup" | "dropoff") {
  if (!s.address) throw new Error(`Missing ${label} address`);
  if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng))
    throw new Error(`Missing ${label} lat/lng`);
  if (!s.contactName) throw new Error(`Missing ${label} contact name`);
  if (!s.contactPhone) throw new Error(`Missing ${label} contact phone`);
}

// ✅ Export used by: /app/api/admin/shipments/create/route.ts
export async function createLalamoveOrder(
  input: CreateLalamoveOrderInput
): Promise<CreateLalamoveOrderResult> {
  const env = (process.env.LALAMOVE_ENV || "sandbox") as LalamoveEnv;
  const apiKey = process.env.LALAMOVE_API_KEY || "";
  const apiSecret = process.env.LALAMOVE_API_SECRET || "";
  const market = process.env.LALAMOVE_MARKET || "ID";

  if (!apiKey || !apiSecret) {
    throw new Error("Missing LALAMOVE_API_KEY / LALAMOVE_API_SECRET");
  }

  // ✅ default serviceType if route didn't pass it
  const serviceType = input.serviceType || "MOTORCYCLE";

  const { pickup, dropoff } = normalizeStops(input);
  assertStop(pickup, "pickup");
  assertStop(dropoff, "dropoff");

  const stops: Stop[] = [
    {
      coordinates: { lat: String(pickup.lat), lng: String(pickup.lng) },
      address: pickup.address,
    },
    {
      coordinates: { lat: String(dropoff.lat), lng: String(dropoff.lng) },
      address: dropoff.address,
    },
  ];

  // 1) Create quotation
  const quotationPayload = {
    data: {
      language: input.language || "id_ID",
      serviceType,
      scheduleAt: input.scheduleAt,
      stops,
      item: {
        quantity: "1",
        weight: "LESS_THAN_3_KG",
        categories: ["FOOD_DELIVERY"],
        handlingInstructions: ["KEEP_UPRIGHT"],
      },
    },
  };

  const quotationRes = await lalamoveRequest<{
    data: {
      quotationId: string;
      stops: Array<{ stopId: string }>;
      priceBreakdown?: any;
      expiresAt?: string;
    };
  }>({
    env,
    apiKey,
    apiSecret,
    market,
    method: "POST",
    path: "/v3/quotations",
    requestId: crypto.randomUUID(),
    body: quotationPayload,
  });

  const quotationId = quotationRes.data.quotationId;
  const pickupStopId = quotationRes.data.stops?.[0]?.stopId;
  const dropoffStopId = quotationRes.data.stops?.[1]?.stopId;

  if (!quotationId || !pickupStopId || !dropoffStopId) {
    throw new Error("Failed to create quotation (missing quotationId/stopId)");
  }

  // 2) Place order
  const orderPayload = {
    data: {
      quotationId,
      sender: {
        stopId: pickupStopId,
        name: pickup.contactName,
        phone: pickup.contactPhone,
      },
      recipients: [
        {
          stopId: dropoffStopId,
          name: dropoff.contactName,
          phone: dropoff.contactPhone,
          remarks: dropoff.remarks || "",
        },
      ],
      isPODEnabled: !!input.isPODEnabled,
      metadata: {
        ...(input.metadata || {}),
        ...(input.externalId ? { externalId: input.externalId } : {}),
      },
    },
  };

  const placeRes = await lalamoveRequest<{
    data?: { orderId?: string; shareLink?: string; status?: string };
  }>({
    env,
    apiKey,
    apiSecret,
    market,
    method: "POST",
    path: "/v3/orders",
    requestId: crypto.randomUUID(),
    body: orderPayload,
  });

  const orderId = placeRes?.data?.orderId || null;

  let shareLink = placeRes?.data?.shareLink || null;
  let status = placeRes?.data?.status || null;

  // fetch details if needed
  if (orderId && (!shareLink || !status)) {
    const detail = await lalamoveRequest<{
      data: { orderId: string; shareLink?: string; status?: string };
    }>({
      env,
      apiKey,
      apiSecret,
      market,
      method: "GET",
      path: `/v3/orders/${orderId}`,
      requestId: crypto.randomUUID(),
    });

    shareLink = detail.data.shareLink || shareLink;
    status = detail.data.status || status;
  }

  return {
    quotationId,
    orderId,
    shareLink,
    status,
    priceBreakdown: quotationRes.data.priceBreakdown || null,
    expiresAt: quotationRes.data.expiresAt || null,
  };
}




/*

import crypto from "crypto";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function baseUrl() {
  const env = (process.env.LALAMOVE_ENV || "sandbox").toLowerCase();
  return env === "production" ? "https://rest.lalamove.com" : "https://rest.sandbox.lalamove.com";
}

function market() {
  return process.env.LALAMOVE_MARKET || "ID";
}

function nonce() {
  return crypto.randomUUID();
}

/**
 * Lalamove signature:
 * SIGNATURE = HmacSHA256ToHex(`${time}\r\n${method}\r\n${path}\r\n\r\n${body}`, secret)
 * TOKEN = `${key}:${time}:${signature}`
 * Headers:
 * Authorization: hmac <TOKEN>
 * Market: <YOUR_MARKET>
 * Request-ID: <NONCE>
 */


/*function signedHeaders(method: string, path: string, bodyString: string) {
  const key = getEnv("LALAMOVE_API_KEY");
  const secret = getEnv("LALAMOVE_API_SECRET");

  const time = Date.now().toString();
  const rawSignature = `${time}\r\n${method.toUpperCase()}\r\n${path}\r\n\r\n${bodyString}`;
  const signature = crypto.createHmac("sha256", secret).update(rawSignature).digest("hex"); // lowercase hex

  const token = `${key}:${time}:${signature}`;

  return {
    Authorization: `hmac ${token}`,
    Market: market(),
    "Request-ID": nonce(),
    "Content-Type": "application/json",
  };
}

async function llmRequest<T>(method: string, path: string, body?: any): Promise<T> {
  const url = `${baseUrl()}${path}`;
  const bodyString = body ? JSON.stringify(body) : "";
  const headers = signedHeaders(method, path, bodyString);

  const res = await fetch(url, {
    method,
    headers,
    body: body ? bodyString : undefined,
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Lalamove ${method} ${path} failed (${res.status}): ${data?.message ?? JSON.stringify(data)}`);
  }
  return data as T;
}

export type LalamoveCreateOrderInput = {
  // destination
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  recipientName: string;
  recipientPhone: string;
  remarks?: string;

  // metadata
  externalId: string; // midtrans_order_id
};

export async function createLalamoveOrder(input: LalamoveCreateOrderInput) {
  const pickupName = getEnv("LALAMOVE_PICKUP_NAME");
  const pickupPhone = getEnv("LALAMOVE_PICKUP_PHONE");
  const pickupAddress = getEnv("LALAMOVE_PICKUP_ADDRESS");
  const pickupLat = Number(getEnv("LALAMOVE_PICKUP_LAT"));
  const pickupLng = Number(getEnv("LALAMOVE_PICKUP_LNG"));

  const serviceType = process.env.LALAMOVE_SERVICE_TYPE || "MOTORCYCLE";
  const language = process.env.LALAMOVE_LANGUAGE || "id_ID";

  if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
    throw new Error("Invalid pickup lat/lng env vars");
  }

  // 1) Create quotation
  const quotationBody = {
    data: {
      serviceType,
      language,
      stops: [
        {
          coordinates: { lat: String(pickupLat), lng: String(pickupLng) },
          address: pickupAddress,
        },
        {
          coordinates: { lat: String(input.dropoffLat), lng: String(input.dropoffLng) },
          address: input.dropoffAddress,
        },
      ],
    },
  };

  const quotationRes: any = await llmRequest("POST", "/v3/quotations", quotationBody);

  const quotationId = quotationRes?.data?.quotationId;
  const stops = quotationRes?.data?.stops;
  const pickupStopId = stops?.[0]?.stopId;
  const dropoffStopId = stops?.[1]?.stopId;

  if (!quotationId || !pickupStopId || !dropoffStopId) {
    throw new Error("Lalamove quotation response missing quotationId/stopIds");
  }

  // 2) Place order
  const orderBody = {
    data: {
      quotationId,
      sender: {
        stopId: pickupStopId,
        name: pickupName,
        phone: pickupPhone,
      },
      recipients: [
        {
          stopId: dropoffStopId,
          name: input.recipientName,
          phone: input.recipientPhone,
          remarks: input.remarks || "",
        },
      ],
      isPODEnabled: false,
      metadata: {
        midtransOrderId: input.externalId,
        brand: "Cookie Doh",
      },
    },
  };

  const orderRes: any = await llmRequest("POST", "/v3/orders", orderBody);

  return {
    quotation: quotationRes?.data,
    order: orderRes?.data,
    orderId: orderRes?.data?.orderId,
    shareLink: orderRes?.data?.shareLink,
    status: orderRes?.data?.status,
  };
}
*/