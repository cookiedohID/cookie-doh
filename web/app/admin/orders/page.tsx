"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type OrderRow = {
  id?: string;
  order_no?: string;
  created_at?: string;

  customer_name?: string;
  customer_phone?: string;

  payment_status?: string; // PENDING / PAID
  fullfillment_status?: string; // pending / sending / sent
  shipment_status?: string;

  tracking_url?: string;

  destination_area_label?: string;
  shipping_address?: string;
  building_name?: string;

  total_idr?: number;
};

const idr = (n?: number) =>
  typeof n === "number" ? `Rp ${n.toLocaleString("id-ID")}` : "—";

type Filter =
  | "all"
  | "pending"
  | "paid"
  | "sending"
  | "sent";

export default function AdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = async () => {
    const res = await fetch("/api/admin/orders?limit=80", { cache: "no-store" });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error || "Failed to load orders");
    setOrders(j.orders || []);
  };

  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        await load();
      } catch (e: any) {
        setErr(e?.message || "Failed to load orders");
      }
    })();
  }, []);

  const patch = async (id: string, body: any) => {
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error || "Update failed");
  };

  const quickPaid = async (id: string) => {
    setBusyId(id);
    await patch(id, { payment_status: "PAID" });
    await load();
    setBusyId(null);
  };

  const quickSending = async (id: string) => {
    setBusyId(id);
    await patch(id, { fullfillment_status: "sending" });
    await load();
    setBusyId(null);
  };

  const quickSent = async (id: string) => {
    setBusyId(id);
    await patch(id, { fullfillment_status: "sent" });
    await load();
    setBusyId(null);
  };

  // 🔍 FILTER LOGIC
  const filteredOrders = useMemo(() => {
    if (filter === "all") return orders;

    return orders.filter((o) => {
      if (filter === "pending") return o.payment_status === "PENDING";
      if (filter === "paid") return o.payment_status === "PAID";
      if (filter === "sending") return o.fullfillment_status === "sending";
      if (filter === "sent") return o.fullfillment_status === "sent";
      return true;
    });
  }, [orders, filter]);

  // 🎨 STATUS COLOR
  const rowColor = (o: OrderRow) => {
    if (o.fullfillment_status === "sent") return "#E8F7EF";     // green
    if (o.fullfillment_status === "sending") return "#F2ECFF"; // purple
    if (o.payment_status === "PAID") return "#EAF2FF";         // blue
    if (o.payment_status === "PENDING") return "#FFF4E5";     // orange
    return "#fff";
  };

  return (
    <main style={{ padding: 18, maxWidth: 1300, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Admin — Orders</h1>

      {/* FILTER BAR */}
      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          ["all", "All"],
          ["pending", "Pending payment"],
          ["paid", "Paid"],
          ["sending", "Sending"],
          ["sent", "Sent"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key as Filter)}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.12)",
              background: filter === key ? "#0052CC" : "#fff",
              color: filter === key ? "#fff" : "#101010",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ marginTop: 12, color: "crimson", fontWeight: 900 }}>
          {err}
        </div>
      )}

      <div style={{ marginTop: 14, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 16, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "rgba(0,0,0,0.03)" }}>
            <tr>
              <th style={{ padding: 12, textAlign: "left" }}>Order</th>
              <th style={{ padding: 12, textAlign: "left" }}>Customer</th>
              <th style={{ padding: 12, textAlign: "left" }}>Destination</th>
              <th style={{ padding: 12, textAlign: "left" }}>Total</th>
              <th style={{ padding: 12, textAlign: "left" }}>Quick</th>
            </tr>
          </thead>

          <tbody>
            {filteredOrders.map((o) => {
              const hasId = !!o.id;
              const busy = busyId === o.id;

              return (
                <tr
                  key={o.id}
                  style={{
                    background: rowColor(o),
                    borderTop: "1px solid rgba(0,0,0,0.08)",
                    cursor: hasId ? "pointer" : "default",
                  }}
                  onClick={() => hasId && router.push(`/admin/orders/${o.id}`)}
                >
                  <td style={{ padding: 12, fontWeight: 900 }}>
                    {o.order_no}
                  </td>

                  <td style={{ padding: 12 }}>
                    <div>{o.customer_name}</div>
                    <div style={{ fontSize: 12, color: "#6B6B6B" }}>
                      {o.customer_phone}
                    </div>
                  </td>

                  <td style={{ padding: 12 }}>
                    <div>{o.destination_area_label}</div>
                    <div style={{ fontSize: 12, color: "#6B6B6B" }}>
                      {o.shipping_address}
                    </div>
                  </td>

                  <td style={{ padding: 12, fontWeight: 900 }}>
                    {idr(o.total_idr)}
                  </td>

                  <td style={{ padding: 12 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          quickPaid(o.id!);
                        }}
                      >
                        Paid
                      </button>
                      <button
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          quickSending(o.id!);
                        }}
                      >
                        Sending
                      </button>
                      <button
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          quickSent(o.id!);
                        }}
                      >
                        Sent
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {filteredOrders.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 16, color: "#6B6B6B" }}>
                  No orders in this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
