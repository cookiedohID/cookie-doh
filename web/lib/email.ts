// web/lib/email.ts

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

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

      <p><strong>Order:</strong> ${params.orderNo}</p>
      <p><strong>Customer:</strong> ${params.customerName || "-"}</p>
      <p><strong>Phone:</strong> ${params.customerPhone || "-"}</p>
      <p><strong>Fulfilment:</strong> ${params.fulfilment || "-"}</p>
      <p><strong>Schedule:</strong> ${[params.scheduleDate, params.scheduleTime]
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

  await resend.emails.send({
    from: "onboarding@resend.dev",
    to,
    subject,
    html,
  });
}