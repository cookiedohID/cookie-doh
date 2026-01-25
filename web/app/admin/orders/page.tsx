"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type OrderRow = {
  id: string;
  order_no?: string;

  customer_name?: string;
  customer_phone?: string;

  payment_status?: "PENDING" | "PAID" | string;

  fulfilment_status?: "pending" | "sending" | "sent" | string;
  fulfillment_status?: "delivery" | "pickup" | string;

  shipment_status?: string;
  tracking_url?: string;

  destination_area_label?: string;
  shipping_address?: string;

  total_idr?: number;

  meta?: any;
};

const ADMIN_WA = "6281932181818";

type Filter = "all" | "pending" | "paid" | "sending" | "sent";

const idr = (n?: number) =>
  typeof n === "number" ? `Rp ${n.toLocaleString("id-ID")}` : "—";

function isUuid(id: unknown): id is string {
  return (
    typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  );
}

const pillButtonStyle = (bg: string, disabled: boolean): React.CSSProperties => ({
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: bg,
  color: disabled ? "#777" : "#101010",
  fontWeight: 900,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.6 : 1,
});

const badgeStyle = (bg: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: bg,
  fontSize: 12,
  fontWeight: 900,
});

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

function parseMeta(meta: any) {
  if (!meta) return null;
  if (typeof meta === "object") return meta;
  if (typeof meta === "string") {
    try {
      return JSON.parse(meta);
    } catch {
      return null;
    }
  }
  return null;
}

function getScheduleInfo(o: OrderRow) {
  const meta = parseMeta(o.meta);
  const fulfillment = meta?.fulfillment || null;
  const pickup = meta?.pickup || null;

  const type = (fulfillment?.type || o.fulfillment_status || "").toString().trim() || "";
  const scheduleDate = (fulfillment?.scheduleDate || "").toString().trim();
  const scheduleTime = (fulfillment?.scheduleTime || "").toString().trim();
  const pickupPoint = (pickup?.pointName || "").toString().trim();

  return { type, scheduleDate, scheduleTime, pickupPoint };
}

export default function AdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [errDetail, setErrDetail] = useState<any>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = async () => {
    const res = await fetch("/api/admin/orders?limit=80", { cache: "no-store" });
    const { json, text } = await safeJson(res);
    if (!res.ok) throw new Error(json?.error || `Failed to load orders: ${text?.slice(0, 200)}`);
    setOrders(Array.isArray(json?.orders) ? json.orders : []);
  };

  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        setErrDetail(null);
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

    const { json, text } = await safeJson(res);

    if (!res.ok) {
      const msg = json?.error || `Update failed: ${text?.slice(0, 200)}`;
      const detail = json || text;
      const error = new Error(msg);
      (error as any).detail = detail;
      throw error;
    }

    return json;
  };

  const onQuick = async (
    e: React.MouseEvent<HTMLButtonElement>,
    action: "paid" | "sending" | "sent"
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const id = e.currentTarget.dataset.orderId;

    if (!isUuid(id)) {
      setErr("Invalid order id");
      setErrDetail({ id });
      return;
    }

    setBusyId(id);
    try {
      setErr(null);
      setErrDetail(null);

      if (action === "paid") await patch(id, { payment_status: "PAID" });
      if (action === "sending") await patch(id, { fulfilment_status: "sending" });
      if (action === "sent") await patch(id, { fulfilment_status: "sent" });

      await load();
    } catch (e: any) {
      setErr(e?.message || "Update failed");
      setErrDetail(e?.detail || null);
    } finally {
      setBusyId(null);
    }
  };

  const bookLalamove = async (id: string) => {
    const res = await fetch(`/api/admin/orders/${id}/lalamove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const { json, text } = await safeJson(res);

    if (!res.ok) {
      const msg = json?.error || `Lalamove failed: ${text?.slice(0, 200)}`;
      const error = new Error(msg);
      (error as any).detail = json || text;
      throw error;
    }

    return json;
  };

  const openWhatsAppAdmin = async (orderId: string) => {
    const tab = window.open("about:blank", "_blank");
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/wa-summary`, {
        method: "GET",
        cache: "no-store",
      });

      const { json, text } = await safeJson(res);

      if (!res.ok) {
        const msg = json?.error || `Failed to build WA message: ${text?.slice(0, 200)}`;
        throw new Error(msg);
      }

      const message = String(json?.message || "").trim();
      const waUrl = `https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(message)}`;

      if (tab) tab.location.href = waUrl;
      else window.location.href = waUrl;
    } catch (e: any) {
      if (tab) tab.close();
      setErr(e?.message || "Failed to open WhatsApp");
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
    if (o.fulfilment_status === "sent") return "#E8F7EF";
    if (o.fulfilment_status === "sending") return "#F2ECFF";
    if (o.payment_status === "PAID") return "#EAF2FF";
    if (o.payment_status === "PENDING") return "#FFF4E5";
    return "#fff";
  };

  return (
    <main style={{ padding: 18, maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Admin — Orders</h1>

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
          {errDetail ? (
            <pre
              style={{
                marginTop: 8,
                background: "rgba(0,0,0,0.04)",
                padding: 12,
                borderRadius: 12,
                overflow: "auto",
                fontSize: 12,
                fontWeight: 700,
                color: "#111",
              }}
            >
              {typeof errDetail === "string" ? errDetail : JSON.stringify(errDetail, null, 2)}
            </pre>
          ) : null}
        </div>
      )}

      <div style={{ marginTop: 14, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 16, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "rgba(0,0,0,0.03)" }}>
            <tr>
              <th style={{ padding: 12, textAlign: "left" }}>Order</th>
              <th style={{ padding: 12, textAlign: "left" }}>Customer</th>
              <th style={{ padding: 12, textAlign: "left" }}>Destination</th>
              <th style={{ padding: 12, textAlign: "left" }}>Schedule</th>
              <th style={{ padding: 12, textAlign: "left" }}>Total</th>
              <th style={{ padding: 12, textAlign: "left" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredOrders.map((o, idx) => {
              const uuid = o.id;
              const hasId = isUuid(uuid);
              const busy = hasId ? busyId === uuid : false;

              const isPaid = o.payment_status === "PAID";
              const isSending = o.fulfilment_status === "sending";
              const isSent = o.fulfilment_status === "sent";

              const deliveryBooked = o.shipment_status === "BOOKED" || !!o.tracking_url;

              const paidDisabled = busy || isPaid;
              const sendingDisabled = busy || !isPaid || isSending || isSent;
              const sentDisabled = busy || !isSending || isSent;
              const bookDisabled = busy || !isPaid || deliveryBooked;

              const schedule = getScheduleInfo(o);
              const scheduleText =
                schedule.scheduleDate && schedule.scheduleTime
                  ? `${schedule.scheduleDate} • ${schedule.scheduleTime}`
                  : "—";

              const fulfillmentLabel =
                schedule.type === "pickup"
                  ? "Pickup"
                  : schedule.type === "delivery"
                  ? "Delivery"
                  : (o.fulfillment_status ? String(o.fulfillment_status) : "—");

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
                  <td style={{ padding: 12, fontWeight: 900 }}>{o.order_no || "—"}</td>

                  <td style={{ padding: 12 }}>
                    <div style={{ fontWeight: 900 }}>{o.customer_name || "—"}</div>
                    <div style={{ fontSize: 12, color: "#6B6B6B", fontWeight: 800 }}>
                      {o.customer_phone || ""}
                    </div>
                  </td>

                  <td style={{ padding: 12 }}>
                    <div style={{ fontWeight: 900 }}>{o.destination_area_label || "—"}</div>
                    <div style={{ fontSize: 12, color: "#6B6B6B", fontWeight: 800 }}>
                      {o.shipping_address || "—"}
                    </div>
                  </td>

                  <td style={{ padding: 12 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={badgeStyle("rgba(0,82,204,0.08)")}>{fulfillmentLabel}</span>
                      <span style={badgeStyle("rgba(0,0,0,0.04)")}>{scheduleText}</span>
                      {schedule.type === "pickup" && schedule.pickupPoint ? (
                        <span style={badgeStyle("rgba(0,0,0,0.04)")}>📍 {schedule.pickupPoint}</span>
                      ) : null}
                    </div>
                  </td>

                  <td style={{ padding: 12, fontWeight: 900 }}>{idr(o.total_idr)}</td>

                  <td style={{ padding: 12 }}>
                    {hasId ? (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <button
                          type="button"
                          data-order-id={uuid}
                          disabled={paidDisabled}
                          onClick={(e) => onQuick(e, "paid")}
                          style={pillButtonStyle("#EAF2FF", paidDisabled)}
                        >
                          {isPaid ? "Paid ✓" : busy ? "..." : "Paid"}
                        </button>

                        <button
                          type="button"
                          data-order-id={uuid}
                          disabled={sendingDisabled}
                          onClick={(e) => onQuick(e, "sending")}
                          style={pillButtonStyle("#F2ECFF", sendingDisabled)}
                        >
                          {isSending || isSent ? "Sending ✓" : busy ? "..." : "Sending"}
                        </button>

                        <button
                          type="button"
                          data-order-id={uuid}
                          disabled={sentDisabled}
                          onClick={(e) => onQuick(e, "sent")}
                          style={pillButtonStyle("#E8F7EF", sentDisabled)}
                        >
                          {isSent ? "Sent ✓" : busy ? "..." : "Sent"}
                        </button>

                        <button
                          type="button"
                          disabled={bookDisabled}
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setBusyId(uuid);
                            try {
                              setErr(null);
                              setErrDetail(null);
                              await bookLalamove(uuid);
                              await load();
                            } catch (ex: any) {
                              setErr(ex?.message || "Lalamove failed");
                              setErrDetail(ex?.detail || null);
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          style={pillButtonStyle("#FFF4E5", bookDisabled)}
                        >
                          {deliveryBooked ? "Lalamove ✓" : busy ? "..." : "Book Lalamove"}
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openWhatsAppAdmin(uuid);
                          }}
                          style={pillButtonStyle("#fff", false)}
                        >
                          WhatsApp Admin
                        </button>

                        {o.tracking_url ? (
                          <a
                            href={o.tracking_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{ fontSize: 12, fontWeight: 900, color: "#0052CC", textDecoration: "none" }}
                          >
                            Track
                          </a>
                        ) : null}
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
                <td colSpan={6} style={{ padding: 16, color: "#6B6B6B" }}>
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


/*
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

  // Some code paths use this spelling
  fulfilment_status?: "pending" | "sending" | "sent" | string;

  // DB column (you inserted in /api/checkout)
  fulfillment_status?: "delivery" | "pickup" | string;

  shipment_status?: string; // "BOOKED" etc
  tracking_url?: string;

  destination_area_label?: string;
  shipping_address?: string;

  total_idr?: number;

  // NEW: meta can hold schedule + pickup point
  meta?: any;
};

const ADMIN_WA = "6281932181818"; // admin WA number (no +)

type Filter = "all" | "pending" | "paid" | "sending" | "sent";

const idr = (n?: number) =>
  typeof n === "number" ? `Rp ${n.toLocaleString("id-ID")}` : "—";

function isUuid(id: unknown): id is string {
  return (
    typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  );
}

const pillButtonStyle = (bg: string, disabled: boolean): React.CSSProperties => ({
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: bg,
  color: disabled ? "#777" : "#101010",
  fontWeight: 900,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.6 : 1,
});

const badgeStyle = (bg: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: bg,
  fontSize: 12,
  fontWeight: 900,
});

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

function parseMeta(meta: any) {
  if (!meta) return null;
  if (typeof meta === "object") return meta;
  if (typeof meta === "string") {
    try {
      return JSON.parse(meta);
    } catch {
      return null;
    }
  }
  return null;
}

function getScheduleInfo(o: OrderRow) {
  const meta = parseMeta(o.meta);
  const fulfillment = meta?.fulfillment || null; // { type, scheduleDate, scheduleTime }
  const pickup = meta?.pickup || null; // { pointName, pointAddress }

  const type =
    (fulfillment?.type || o.fulfillment_status || "").toString().trim() || "";

  const scheduleDate = (fulfillment?.scheduleDate || "").toString().trim();
  const scheduleTime = (fulfillment?.scheduleTime || "").toString().trim();

  const pickupPoint = (pickup?.pointName || "").toString().trim();

  return { type, scheduleDate, scheduleTime, pickupPoint };
}

export default function AdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [errDetail, setErrDetail] = useState<any>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = async () => {
    const res = await fetch("/api/admin/orders?limit=80", { cache: "no-store" });
    const { json, text } = await safeJson(res);
    if (!res.ok) throw new Error(json?.error || `Failed to load orders: ${text?.slice(0, 200)}`);
    setOrders(Array.isArray(json?.orders) ? json.orders : []);
  };

  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        setErrDetail(null);
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

    const { json, text } = await safeJson(res);

    if (!res.ok) {
      const msg = json?.error || `Update failed: ${text?.slice(0, 200)}`;
      const detail = json || text;
      const error = new Error(msg);
      (error as any).detail = detail;
      throw error;
    }

    return json;
  };

  const onQuick = async (
    e: React.MouseEvent<HTMLButtonElement>,
    action: "paid" | "sending" | "sent"
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const id = e.currentTarget.dataset.orderId;

    if (!isUuid(id)) {
      setErr("Invalid order id");
      setErrDetail({ id });
      return;
    }

    setBusyId(id);
    try {
      setErr(null);
      setErrDetail(null);

      if (action === "paid") await patch(id, { payment_status: "PAID" });
      if (action === "sending") await patch(id, { fulfilment_status: "sending" });
      if (action === "sent") await patch(id, { fulfilment_status: "sent" });

      await load();
    } catch (e: any) {
      setErr(e?.message || "Update failed");
      setErrDetail(e?.detail || null);
    } finally {
      setBusyId(null);
    }
  };

  const bookLalamove = async (id: string) => {
    const res = await fetch(`/api/admin/orders/${id}/lalamove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const { json, text } = await safeJson(res);

    if (!res.ok) {
      const msg = json?.error || `Lalamove failed: ${text?.slice(0, 200)}`;
      const error = new Error(msg);
      (error as any).detail = json || text;
      throw error;
    }

    return json;
  };

  // ✅ WhatsApp Admin: fetch full summary from server (includes items when available)
  const openWhatsAppAdmin = async (orderId: string) => {
    const tab = window.open("about:blank", "_blank");
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/wa-summary`, {
        method: "GET",
        cache: "no-store",
      });

      const { json, text } = await safeJson(res);

      if (!res.ok) {
        const msg = json?.error || `Failed to build WA message: ${text?.slice(0, 200)}`;
        throw new Error(msg);
      }

      const message = String(json?.message || "").trim();
      const waUrl = `https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(message)}`;

      if (tab) tab.location.href = waUrl;
      else window.location.href = waUrl;
    } catch (e: any) {
      if (tab) tab.close();
      setErr(e?.message || "Failed to open WhatsApp");
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
    <main style={{ padding: 18, maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Admin — Orders</h1>

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
          {errDetail ? (
            <pre
              style={{
                marginTop: 8,
                background: "rgba(0,0,0,0.04)",
                padding: 12,
                borderRadius: 12,
                overflow: "auto",
                fontSize: 12,
                fontWeight: 700,
                color: "#111",
              }}
            >
              {typeof errDetail === "string" ? errDetail : JSON.stringify(errDetail, null, 2)}
            </pre>
          ) : null}
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
              <th style={{ padding: 12, textAlign: "left" }}>Schedule</th>
              <th style={{ padding: 12, textAlign: "left" }}>Total</th>
              <th style={{ padding: 12, textAlign: "left" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredOrders.map((o, idx) => {
              const uuid = o.id;
              const hasId = isUuid(uuid);
              const busy = hasId ? busyId === uuid : false;

              const isPaid = o.payment_status === "PAID";
              const isSending = o.fulfilment_status === "sending";
              const isSent = o.fulfilment_status === "sent";

              const deliveryBooked = o.shipment_status === "BOOKED" || !!o.tracking_url;

              const paidDisabled = busy || isPaid;
              const sendingDisabled = busy || !isPaid || isSending || isSent;
              const sentDisabled = busy || !isSending || isSent;
              const bookDisabled = busy || !isPaid || deliveryBooked;

              const schedule = getScheduleInfo(o);

              const scheduleText =
                schedule.scheduleDate && schedule.scheduleTime
                  ? `${schedule.scheduleDate} • ${schedule.scheduleTime}`
                  : "—";

              const fulfillmentLabel =
                schedule.type === "pickup"
                  ? "Pickup"
                  : schedule.type === "delivery"
                  ? "Delivery"
                  : (o.fulfillment_status ? String(o.fulfillment_status) : "—");

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
                  <td style={{ padding: 12, fontWeight: 900 }}>{o.order_no || "—"}</td>

                  <td style={{ padding: 12 }}>
                    <div style={{ fontWeight: 900 }}>{o.customer_name || "—"}</div>
                    <div style={{ fontSize: 12, color: "#6B6B6B", fontWeight: 800 }}>
                      {o.customer_phone || ""}
                    </div>
                  </td>

                  <td style={{ padding: 12 }}>
                    <div style={{ fontWeight: 900 }}>{o.destination_area_label || "—"}</div>
                    <div style={{ fontSize: 12, color: "#6B6B6B", fontWeight: 800 }}>
                      {o.shipping_address || "—"}
                    </div>
                  </td>

                  {/* ✅ NEW schedule column */}
/*                  <td style={{ padding: 12 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={badgeStyle("rgba(0,82,204,0.08)")}>{fulfillmentLabel}</span>
                      <span style={badgeStyle("rgba(0,0,0,0.04)")}>{scheduleText}</span>
                      {schedule.type === "pickup" && schedule.pickupPoint ? (
                        <span style={badgeStyle("rgba(0,0,0,0.04)")}>
                          📍 {schedule.pickupPoint}
                        </span>
                      ) : null}
                    </div>
                  </td>

                  <td style={{ padding: 12, fontWeight: 900 }}>{idr(o.total_idr)}</td>

                  <td style={{ padding: 12 }}>
                    {hasId ? (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <button
                          type="button"
                          data-order-id={uuid}
                          disabled={paidDisabled}
                          onClick={(e) => onQuick(e, "paid")}
                          style={pillButtonStyle("#EAF2FF", paidDisabled)}
                        >
                          {isPaid ? "Paid ✓" : busy ? "..." : "Paid"}
                        </button>

                        <button
                          type="button"
                          data-order-id={uuid}
                          disabled={sendingDisabled}
                          onClick={(e) => onQuick(e, "sending")}
                          style={pillButtonStyle("#F2ECFF", sendingDisabled)}
                        >
                          {isSending || isSent ? "Sending ✓" : busy ? "..." : "Sending"}
                        </button>

                        <button
                          type="button"
                          data-order-id={uuid}
                          disabled={sentDisabled}
                          onClick={(e) => onQuick(e, "sent")}
                          style={pillButtonStyle("#E8F7EF", sentDisabled)}
                        >
                          {isSent ? "Sent ✓" : busy ? "..." : "Sent"}
                        </button>

                        <button
                          type="button"
                          disabled={bookDisabled}
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setBusyId(uuid);
                            try {
                              setErr(null);
                              setErrDetail(null);
                              await bookLalamove(uuid);
                              await load();
                            } catch (ex: any) {
                              setErr(ex?.message || "Lalamove failed");
                              setErrDetail(ex?.detail || null);
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          style={pillButtonStyle("#FFF4E5", bookDisabled)}
                        >
                          {deliveryBooked ? "Lalamove ✓" : busy ? "..." : "Book Lalamove"}
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openWhatsAppAdmin(uuid);
                          }}
                          style={pillButtonStyle("#fff", false)}
                          title="Send order summary to admin WhatsApp"
                        >
                          WhatsApp Admin
                        </button>

                        {o.tracking_url ? (
                          <a
                            href={o.tracking_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              fontSize: 12,
                              fontWeight: 900,
                              color: "#0052CC",
                              textDecoration: "none",
                            }}
                          >
                            Track
                          </a>
                        ) : null}
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
                <td colSpan={6} style={{ padding: 16, color: "#6B6B6B" }}>
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
*/