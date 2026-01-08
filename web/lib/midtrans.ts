import crypto from "crypto";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

/**
 * Midtrans signature_key verification:
 * sha512(order_id + status_code + gross_amount + server_key)
 */
export function verifyMidtransSignature(payload: any) {
  const serverKey = getEnv("MIDTRANS_SERVER_KEY");

  const order_id = String(payload?.order_id ?? "");
  const status_code = String(payload?.status_code ?? "");
  const gross_amount = String(payload?.gross_amount ?? "");
  const signature_key = String(payload?.signature_key ?? "");

  if (!order_id || !status_code || !gross_amount || !signature_key) return false;

  const raw = order_id + status_code + gross_amount + serverKey;
  const hash = crypto.createHash("sha512").update(raw).digest("hex");

  return hash === signature_key;
}
