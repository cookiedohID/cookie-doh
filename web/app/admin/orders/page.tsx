"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type OrderRow = {
  id: string;
  created_at?: string;
  customer_name?: string;
  customer_phone?: string;
  total?: number;
  payment_status?: string;
  fulfillment_status?: string;
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        const res = await fetch("/api/admin/orders?limit=80", { cache: "no-store" });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || "Failed to load orders");
        setOrders(j.orders || []);
      } catch (e: any) {
        setErr(e?.message || "Failed to load orders");
      }
    })();
  }, []);

  return (
    <main style={{ padding: 18, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Admin — Orders</h1>
      <p style={{ marginTop: 6, color: "rgba(0,0,0,0.6)" }}>
        View orders + update status.
      </p>

      {err && (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", background: "#fff" }}>
          <div style={{ color: "crimson", fontWeight: 900 }}>Admin error</div>
          <div style={{ marginTop: 6, color: "rgba(0,0,0,0.7)" }}>{err}</div>
          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(0,0,0,0.6)" }}>
            Check Vercel logs for missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
          </div>
        </div>
      )}

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
            {orders.length === 0 && !err && (
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



/*
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
*/