"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function toIDR(n: number) {
  return `Rp ${Number(n || 0).toLocaleString("id-ID")}`;
}

function isUuid(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

export default function OrderDetailClient({ id }: { id: string }) {
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [shippingBusy, setShippingBusy] = useState(false);

  // DB statuses
  const [paymentStatus, setPaymentStatus] = useState<string>("PENDING");
  const [fulfillmentStatus, setFulfillmentStatus] = useState<string>("pending");
  const [shipmentStatus, setShipmentStatus] = useState<string>("not_created");

  const [trackingUrl, setTrackingUrl] = useState<string>("");
  const [waybill, setWaybill] = useState<string>("");

  // Always patch using UUID once loaded
  const patchId = useMemo(() => {
    const oid = order?.id;
    return isUuid(oid) ? oid : null;
  }, [order]);

  async function load() {
    const identifier = String(id ?? "").trim();
    if (!identifier) {
      setErr("Missing order id in URL");
      return;
    }


    const res = await fetch(`/api/admin/orders/${encodeURIComponent(identifier)}`, { cache: "no-store" });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error || "Failed to load order");

    setOrder(j.order);
    setItems(j.items || []);

    setPaymentStatus(j.order?.payment_status || "PENDING");
    setFulfillmentStatus(j.order?.fulfilment_status || "pending");
    setShipmentStatus(j.order?.shipment_status || "not_created");

    setTrackingUrl(j.order?.tracking_url || "");
    setWaybill(j.order?.waybill || "");
  }

  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        await load();
      } catch (e: any) {
        setErr(e?.message || "Failed to load order");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const itemLines = useMemo(() => {
    return (items || [])
      .map((it) => `${it.item_name || it.name || "Item"} ×${it.quantity || 0}`)
      .join("\n");
  }, [items]);

  const saveStatus = async () => {
    try {
      if (!patchId) throw new Error("Order UUID not ready yet");
      setSaving(true);
      setErr(null);

      const res = await fetch(`/api/admin/orders/${patchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_status: paymentStatus,
          fulfilment_status: fulfillmentStatus,
          shipment_status: shipmentStatus,
          tracking_url: trackingUrl,
          waybill: waybill,
        }),
      });

      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Failed to update order");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const createLalamove = async () => {
    try {
      if (!patchId) throw new Error("Order UUID not ready yet");
      setShippingBusy(true);
      setErr(null);

      const res = await fetch(`/api/admin/orders/${patchId}/lalamove`, { method: "POST" });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error || "Lalamove create failed");

      await load();
      alert("Lalamove shipment created ✅");
    } catch (e: any) {
      setErr(e?.message || "Lalamove create failed");
    } finally {
      setShippingBusy(false);
    }
  };

  if (err && !order) {
    return (
      <main style={{ padding: 18, maxWidth: 980, margin: "0 auto" }}>
        <Link href="/admin/orders" style={{ color: "#0014a7", fontWeight: 800, textDecoration: "none" }}>
          ← Back
        </Link>
        <div style={{ marginTop: 12, color: "crimson", fontWeight: 800 }}>{err}</div>
      </main>
    );
  }

  if (!order) {
    return (
      <main style={{ padding: 18, maxWidth: 980, margin: "0 auto" }}>
        <Link href="/admin/orders" style={{ color: "#0014a7", fontWeight: 800, textDecoration: "none" }}>
          ← Back
        </Link>
        <div style={{ marginTop: 12, color: "rgba(0,0,0,0.6)" }}>Loading…</div>
      </main>
    );
  }

  return (
    <main style={{ padding: 18, maxWidth: 980, margin: "0 auto" }}>
      <Link href="/admin/orders" style={{ color: "#0014a7", fontWeight: 800, textDecoration: "none" }}>
        ← Back to orders
      </Link>

      <h1 style={{ margin: "10px 0 0", fontSize: 20 }}>
        Order {order.order_no || order.midtrans_order_id || order.id}
      </h1>

      <div style={{ marginTop: 6, color: "rgba(0,0,0,0.7)" }}>
        {order.created_at ? new Date(order.created_at).toLocaleString() : ""}
      </div>

      <section style={{ marginTop: 14, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 16, padding: 14 }}>
        <div style={{ fontWeight: 900 }}>Customer</div>
        <div style={{ marginTop: 6 }}>
          <div><b>{order.customer_name || "-"}</b></div>
          <div style={{ color: "rgba(0,0,0,0.7)" }}>{order.customer_phone || ""}</div>
          {order.email ? <div style={{ color: "rgba(0,0,0,0.7)" }}>{order.email}</div> : null}
        </div>

        <div style={{ marginTop: 12, fontWeight: 900 }}>Destination</div>
        <div style={{ marginTop: 6, color: "rgba(0,0,0,0.75)", lineHeight: 1.5 }}>
          <div><b>Area:</b> {order.destination_area_label || "-"} ({order.destination_area_id || "-"})</div>
          <div><b>Address:</b> {order.shipping_address || order.address || "-"}</div>
          <div><b>Building:</b> {order.building_name || "-"}</div>
          {order.postal ? <div><b>Postal:</b> {order.postal}</div> : null}
          {order.city ? <div><b>City:</b> {order.city}</div> : null}
        </div>

        <div style={{ marginTop: 12, fontWeight: 900 }}>Items</div>
        <pre style={{ marginTop: 6, whiteSpace: "pre-wrap", fontFamily: "inherit", color: "rgba(0,0,0,0.75)" }}>
          {itemLines || "(no items)"}
        </pre>

        <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ color: "rgba(0,0,0,0.65)" }}>Subtotal</div>
            <div style={{ fontWeight: 900 }}>{toIDR(order.subtotal_idr || 0)}</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ color: "rgba(0,0,0,0.65)" }}>Shipping</div>
            <div style={{ fontWeight: 900 }}>{toIDR(order.shipping_cost_idr || 0)}</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 900 }}>Total</div>
            <div style={{ fontWeight: 900 }}>{toIDR(order.total_idr || 0)}</div>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 14, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 16, padding: 14 }}>
        <div style={{ fontWeight: 900 }}>Status</div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800 }}>Payment status</span>
            <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} style={{ height: 42, borderRadius: 12, padding: "0 10px" }}>
              <option value="PENDING">PENDING</option>
              <option value="PAID">PAID</option>
              <option value="FAILED">FAILED</option>
              <option value="REFUNDED">REFUNDED</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800 }}>Fulfillment status</span>
            <select value={fulfillmentStatus} onChange={(e) => setFulfillmentStatus(e.target.value)} style={{ height: 42, borderRadius: 12, padding: "0 10px" }}>
              <option value="pending">pending</option>
              <option value="baking">baking</option>
              <option value="sent">sent</option>
              <option value="completed">completed</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800 }}>Shipment status</span>
            <select value={shipmentStatus} onChange={(e) => setShipmentStatus(e.target.value)} style={{ height: 42, borderRadius: 12, padding: "0 10px" }}>
              <option value="not_created">not_created</option>
              <option value="created">created</option>
              <option value="picked_up">picked_up</option>
              <option value="delivered">delivered</option>
              <option value="failed">failed</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800 }}>Tracking URL</span>
            <input
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
              placeholder="Tracking link (auto from Lalamove or paste manually)"
              style={{ height: 42, borderRadius: 12, padding: "0 10px", border: "1px solid rgba(0,0,0,0.15)" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800 }}>Waybill (optional)</span>
            <input
              value={waybill}
              onChange={(e) => setWaybill(e.target.value)}
              placeholder="Waybill / resi"
              style={{ height: 42, borderRadius: 12, padding: "0 10px", border: "1px solid rgba(0,0,0,0.15)" }}
            />
          </label>

          <button
            onClick={saveStatus}
            disabled={saving}
            style={{
              height: 48,
              borderRadius: 999,
              border: "none",
              background: saving ? "rgba(0,82,204,0.55)" : "#0014a7",
              color: "#fff",
              fontWeight: 900,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save status"}
          </button>

          <button
            onClick={createLalamove}
            disabled={shippingBusy}
            style={{
              height: 48,
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.12)",
              background: shippingBusy ? "rgba(0,0,0,0.04)" : "#fff",
              fontWeight: 900,
              cursor: shippingBusy ? "not-allowed" : "pointer",
            }}
          >
            {shippingBusy ? "Creating shipment…" : "Create Lalamove shipment"}
          </button>
        </div>
      </section>

      {err ? <div style={{ marginTop: 12, color: "crimson", fontWeight: 800 }}>{err}</div> : null}
    </main>
  );
}
