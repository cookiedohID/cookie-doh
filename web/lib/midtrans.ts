// web/lib/midtrans.ts
import crypto from "crypto";

export type MidtransEnv = "sandbox" | "production";

export function midtransEnv(): MidtransEnv {
  const v = (process.env.MIDTRANS_IS_PRODUCTION || "").toString().toLowerCase();
  return v === "true" || v === "1" || v === "yes" ? "production" : "sandbox";
}

export function midtransServerKey() {
  const k = process.env.MIDTRANS_SERVER_KEY || "";
  if (!k) throw new Error("Missing MIDTRANS_SERVER_KEY");
  return k;
}

function snapBaseUrl() {
  return midtransEnv() === "production"
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";
}

function basicAuthHeader(serverKey: string) {
  // Midtrans: Basic Auth username=serverKey, password empty
  const token = Buffer.from(`${serverKey}:`).toString("base64");
  return `Basic ${token}`;
}

/**
 * Create Snap token for POPUP flow.
 * Returns only token (frontend will call window.snap.pay(token))
 */
export async function createSnapToken(input: {
  order_id: string;
  gross_amount: number;
  customer: { name?: string; phone?: string; email?: string };
  siteUrl?: string;
  itemsText?: string;
}) {
  const serverKey = midtransServerKey();
  const url = `${snapBaseUrl()}/snap/v1/transactions`;

  const fullName = (input.customer.name || "").trim();
  const firstName = fullName ? fullName.split(" ")[0] : "Customer";
  const lastName = fullName && fullName.split(" ").length > 1 ? fullName.split(" ").slice(1).join(" ") : "";

  const payload: any = {
    transaction_details: {
      order_id: input.order_id,
      gross_amount: input.gross_amount,
    },
    customer_details: {
      first_name: firstName,
      last_name: lastName,
      email: input.customer.email || undefined,
      phone: input.customer.phone || undefined,
    },
    item_details: [
      {
        id: "cookie-doh-order",
        name: "Cookie Doh Order",
        price: input.gross_amount,
        quantity: 1,
      },
    ],
    custom_field1: input.itemsText || undefined,
    callbacks: input.siteUrl ? { finish: `${input.siteUrl}/checkout/success` } : undefined,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(serverKey),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const j = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    const msg =
      j?.error_messages?.join?.(" | ") ||
      j?.message ||
      j?.status_message ||
      `Midtrans Snap error HTTP ${res.status}`;
    throw new Error(msg);
  }

  const token = String(j?.token || "").trim();
  if (!token) throw new Error(`Midtrans Snap missing token: ${JSON.stringify(j)}`);

  return token;
}

/**
 * Midtrans signature verification (for webhook / notifications)
 * signature_key = sha512(order_id + status_code + gross_amount + server_key)
 * Source: Midtrans docs (signature_key)
 */
export function verifyMidtransSignature(payload: any): boolean {
  try {
    const serverKey = midtransServerKey();

    const order_id = String(payload?.order_id || "");
    const status_code = String(payload?.status_code || "");
    const gross_amount = String(payload?.gross_amount || ""); // Midtrans sends as string like "10000.00"
    const signature_key = String(payload?.signature_key || "");

    if (!order_id || !status_code || !gross_amount || !signature_key) return false;

    const raw = `${order_id}${status_code}${gross_amount}${serverKey}`;
    const hash = crypto.createHash("sha512").update(raw).digest("hex");

    return hash === signature_key;
  } catch {
    return false;
  }
}
