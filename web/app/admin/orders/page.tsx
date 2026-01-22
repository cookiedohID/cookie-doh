"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type OrderRow = {
  id: string;
  order_no?: string;
  created_at?: string;

  customer_name?: string;
  customer_phone?: string;

  payment_status?: "PENDING" | "PAID" | string;

  // ✅ TypeScript hinted this exists in your codebase:
  fulfilment_status?: "pending" | "sending" | "sent" | string;

  shipment_status?: string;
  tracking_url?: string;

  destination_area_label?: string;
  shipping_address?: string;
  building_name?: string;

  total_idr?: number;
};

const idr = (n?: number) =>
  typeof n === "number" ? `Rp ${n.toLocaleString("id-ID")}` : "—";

type Filter = "all" | "pending" | "paid" | "sending" | "sent";

function isUuid(id: unknown): id is string {
  return (
    typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id
    )
  );
}

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
    setOrders(Array.isArray(j.orders) ? j.orders : []);
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

    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error || "Update failed");
  };

  // ✅ one robust handler for all buttons
  const onQuick = async (
    e: React.MouseEvent<HTMLButtonElement>,
    action: "paid" | "sending" | "sent"
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const id = e.currentTarget.dataset.orderId;

    if (!isUuid(id)) {
      console.error("Invalid order id:", id);
      return;
    }

    setBusyId(id);
    try {
      if (action === "paid") await patch(id, { payment_status: "PAID" });
      if (action === "sending") await patch(id, { fulfilment_status: "sending" });
      if (action === "sent") await patch(id, { fulfilment_status: "sent" });

      await load();
    } finally {
      setBusyId(null);
    }
  };

  const filteredOrders = useMemo(() => {
    if (filter === "all") return orders;

    return orders.filter((o) => {
      if (filter === "pending") return o.payment_status === "PENDING";
      if (filter === "paid") return o.payment_status === "PAID";
      if (filter === "sending") return o.fulfilment_status === "sending";
      if (filter === "sent") return o.fulfilment_status === "sent";
      return true;
    });
  }, [orders, filter]);

  const rowColor = (o: OrderRow) => {
    if (o.fulfilment_status === "sent") return "#E8F7EF"; // green
    if (o.fulfilment_status === "sending") return "#F2ECFF"; // purple
    if (o.payment_status === "PAID") return "#EAF2FF"; // blue
    if (o.payment_status === "PENDING") return "#FFF4E5"; // orange
    return "#fff";
  };

  return (
    <main style={{ padding: 18, maxWidth: 1300, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Admin — Orders</h1>

      {/* FILTER BAR */}
      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(
          [
            ["all", "All"],
            ["pending", "Pending payment"],
            ["paid", "Paid"],
            ["sending", "Sending"],
            ["sent", "Sent"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
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

      <div
        style={{
          marginTop: 14,
          border: "1px solid rgba(0,0,0,0.10)",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
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
            {filteredOrders.map((o, idx) => {
              const uuid = o.id;
              const hasId = isUuid(uuid);
              const busy = hasId ? busyId === uuid : false;

              return (
                <tr
                  key={hasId ? uuid : `${o.order_no || "row"}-${idx}`}
                  style={{
                    background: rowColor(o),
                    borderTop: "1px solid rgba(0,0,0,0.08)",
                    cursor: hasId ? "pointer" : "default",
                  }}
                  onClick={() => {
                    if (!hasId) return;
                    router.push(`/admin/orders/${uuid}`);
                  }}
                >
                  <td style={{ padding: 12, fontWeight: 900 }}>
                    {o.order_no || "—"}
                  </td>

                  <td style={{ padding: 12 }}>
                    <div>{o.customer_name || "—"}</div>
                    <div style={{ fontSize: 12, color: "#6B6B6B" }}>
                      {o.customer_phone || ""}
                    </div>
                  </td>

                  <td style={{ padding: 12 }}>
                    <div>{o.destination_area_label || "—"}</div>
                    <div style={{ fontSize: 12, color: "#6B6B6B" }}>
                      {o.shipping_address || "—"}
                    </div>
                  </td>

                  <td style={{ padding: 12, fontWeight: 900 }}>{idr(o.total_idr)}</td>

                  <td style={{ padding: 12 }}>
                    {hasId ? (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          data-order-id={uuid}
                          disabled={busy}
                          onClick={(e) => onQuick(e, "paid")}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid rgba(0,0,0,0.12)",
                            background: "#fff",
                            fontWeight: 900,
                          }}
                        >
                          {busy ? "..." : "Paid"}
                        </button>

                        <button
                          type="button"
                          data-order-id={uuid}
                          disabled={busy}
                          onClick={(e) => onQuick(e, "sending")}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid rgba(0,0,0,0.12)",
                            background: "#fff",
                            fontWeight: 900,
                          }}
                        >
                          {busy ? "..." : "Sending"}
                        </button>

                        <button
                          type="button"
                          data-order-id={uuid}
                          disabled={busy}
                          onClick={(e) => onQuick(e, "sent")}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid rgba(0,0,0,0.12)",
                            background: "#fff",
                            fontWeight: 900,
                          }}
                        >
                          {busy ? "..." : "Sent"}
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: "#999" }}>No valid ID</span>
                    )}
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
