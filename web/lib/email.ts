// web/lib/email.ts

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Escape customer-controlled text before putting it in the HTML email body.
// Without this a customer name like `<img src=x onerror=…>` or a phishing
// `<a>` renders in the owner's inbox (stored HTML injection).
const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );

export async function sendNewOrderEmail(params: {
  orderNo: string;
  customerName?: string | null;
  customerPhone?: string | null;
  fulfilment?: string | null;
  scheduleDate?: string | null;
  scheduleTime?: string | null;
  totalIdr?: number | null;
  adminUrl?: string | null;
}) {
  const to = process.env.ADMIN_NOTIFY_EMAIL;

  if (!to) {
    console.warn("Missing ADMIN_NOTIFY_EMAIL");
    return;
  }

  const total =
    typeof params.totalIdr === "number"
      ? new Intl.NumberFormat("id-ID", {
          style: "currency",
          currency: "IDR",
          maximumFractionDigits: 0,
        }).format(params.totalIdr)
      : "-";

  const subject = `🍪 New Cookie Doh Order — ${params.orderNo}`;

  const html = `
    <div style="font-family:Arial,sans-serif;padding:20px;color:#111;">
      <h2 style="margin-top:0;">🍪 New Cookie Doh Order</h2>

      <p><strong>Order:</strong> ${esc(params.orderNo)}</p>
      <p><strong>Customer:</strong> ${esc(params.customerName) || "-"}</p>
      <p><strong>Phone:</strong> ${esc(params.customerPhone) || "-"}</p>
      <p><strong>Fulfilment:</strong> ${esc(params.fulfilment) || "-"}</p>
      <p><strong>Schedule:</strong> ${[params.scheduleDate, params.scheduleTime]
        .map(esc)
        .filter(Boolean)
        .join(" • ") || "-"}</p>
      <p><strong>Total:</strong> ${total}</p>

      ${
        params.adminUrl
          ? `<p style="margin-top:24px;">
              <a href="${params.adminUrl}"
                 style="display:inline-block;padding:12px 16px;background:#0014A7;color:#fff;text-decoration:none;border-radius:999px;font-weight:700;">
                 Open Admin Order
              </a>
            </p>`
          : ""
      }

      <p style="margin-top:24px;color:#666;">
        Cookie Doh notification system 🤍
      </p>
    </div>
  `;

  // Set EMAIL_FROM to a verified-domain sender (e.g. "Cookie Doh <orders@cookiedoh.id>")
  // for reliable inbox delivery. Falls back to Resend's shared sender.
  const from = process.env.EMAIL_FROM || "Cookie Doh <onboarding@resend.dev>";

  try {
    // Resend returns { data, error } and does NOT throw on API errors (bad
    // sender domain, rate limit, etc.) — so we must inspect `error` explicitly,
    // otherwise a failed send looks like a success and the admin is never told.
    const { error } = await resend.emails.send({ from, to, subject, html });
    if (error) throw new Error((error as any)?.message || "Resend API error");
  } catch (e: any) {
    console.error("[email] send failed:", e?.message || e);
    throw e;
  }
}