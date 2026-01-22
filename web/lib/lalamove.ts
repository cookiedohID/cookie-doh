// web/lib/lalamove.ts
import crypto from "crypto";

type LalamoveEnv = "sandbox" | "production";

export type LalamoveStop = {
  coordinates: { lat: string; lng: string };
  address: string;
};

export type LalamoveQuotationRequest = {
  language: string; // e.g. "id_ID" or "en_ID"
  serviceType: string; // e.g. "MOTORCYCLE" (depends on city config)
  stops: LalamoveStop[];
  scheduleAt?: string; // ISO string, optional (for scheduled / same-day)
  item?: {
    quantity?: string;
    weight?: string; // e.g. "LESS_THAN_3_KG"
    categories?: string[];
    handlingInstructions?: string[];
  };
  specialRequests?: string[];
  isRouteOptimized?: boolean;
};

export type LalamoveOrderRequest = {
  quotationId: string;
  sender: { stopId: string; name: string; phone: string };
  recipients: Array<{ stopId: string; name: string; phone: string; remarks?: string }>;
  isPODEnabled?: boolean;
  metadata?: Record<string, any>;
};

function baseUrl(env: LalamoveEnv) {
  // Docs: Sandbox rest.sandbox.lalamove.com/v3, Prod rest.lalamove.com/v3
  return env === "production"
    ? "https://rest.lalamove.com"
    : "https://rest.sandbox.lalamove.com";
}

// Signature formula from docs:
// raw = `${time}\r\n${method}\r\n${path}\r\n\r\n${body}` (or no body for GET)
// token = `${key}:${time}:${signature}`
// Authorization: hmac <token>
export function lalamoveHeaders(opts: {
  env: LalamoveEnv;
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
    .digest("hex"); // lowercase hex

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
    env: opts.env,
    apiKey: opts.apiKey,
    apiSecret: opts.apiSecret,
    market: opts.market,
    method: opts.method,
    path: opts.path,
    body: bodyStr,
    requestId: opts.requestId,
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