import crypto from "crypto";

const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY!;
const MIDTRANS_IS_PROD = process.env.MIDTRANS_IS_PRODUCTION === "true";

export async function createSnapToken(payload: {
  order_id: string;
  gross_amount: number;
  customer: {
    first_name: string;
    phone?: string;
    email?: string;
  };
}) {
  const url = MIDTRANS_IS_PROD
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Basic " + Buffer.from(MIDTRANS_SERVER_KEY + ":").toString("base64"),
    },
    body: JSON.stringify({
      transaction_details: {
        order_id: payload.order_id,
        gross_amount: payload.gross_amount,
      },
      customer_details: payload.customer,
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error_messages?.[0] || "Midtrans error");
  }

  return json.token as string;
}
