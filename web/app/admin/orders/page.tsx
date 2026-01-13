import Link from "next/link";

type OrderRow = {
  id: string;
  created_at?: string;
  customer_name?: string;
  customer_phone?: string;
  total?: number;
  payment_status?: string;
  fulfillment_status?: string;
  delivery_method?: string;
};

async function fetchOrders() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ""}/api/admin/orders?limit=60`, {
    // ensure fresh
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Failed to load orders");
  return (json.orders || []) as OrderRow[];
}

export default async function AdminOrdersPage() {
  const orders = await fetchOrders();

  return (
    <main style={{ padding: 18, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Admin — Orders</h1>
      <p style={{ marginTop: 6, color: "rgba(0,0,0,0.6)" }}>
        View orders + update status (Paid / Sent).
      </p>

      <div style={{ marginTop: 14, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 16, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "rgba(0,0,0,0.03)" }}>
            <tr>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Time</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Customer</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Total</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Payment</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Fulfillment</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }} />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                <td style={{ padding: 12, fontSize: 13, color: "rgba(0,0,0,0.7)" }}>
                  {o.created_at ? new Date(o.created_at).toLocaleString() : "-"}
                </td>
                <td style={{ padding: 12, fontSize: 13 }}>
                  <div style={{ fontWeight: 800 }}>{o.customer_name || "-"}</div>
                  <div style={{ color: "rgba(0,0,0,0.6)" }}>{o.customer_phone || ""}</div>
                </td>
                <td style={{ padding: 12, fontSize: 13, fontWeight: 800 }}>
                  {typeof o.total === "number" ? `Rp ${o.total.toLocaleString("id-ID")}` : "-"}
                </td>
                <td style={{ padding: 12, fontSize: 13 }}>{o.payment_status || "-"}</td>
                <td style={{ padding: 12, fontSize: 13 }}>{o.fulfillment_status || "-"}</td>
                <td style={{ padding: 12, fontSize: 13 }}>
                  <Link href={`/admin/orders/${o.id}`} style={{ color: "#0052CC", fontWeight: 800, textDecoration: "none" }}>
                    View →
                  </Link>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 16, color: "rgba(0,0,0,0.6)" }}>
                  No orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
