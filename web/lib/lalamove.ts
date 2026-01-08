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
function signedHeaders(method: string, path: string, bodyString: string) {
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
