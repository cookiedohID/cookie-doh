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

  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [acceptBusy, setAcceptBusy] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState<string | null>(null);
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);

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
    setAcceptedAt(j.order?.accepted_at || null);
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

  const acceptOrder = async () => {
    try {
      if (!patchId) throw new Error("Order UUID not ready yet");
      setAcceptBusy(true);
      setErr(null);
      const res = await fetch(`/api/admin/orders/${patchId}/accept`, { method: "POST" });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error || "Accept failed");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Accept failed");
    } finally {
      setAcceptBusy(false);
    }
  };

  const notifyCustomer = async (kind: "confirm" | "on_the_way") => {
    try {
      if (!patchId) throw new Error("Order UUID not ready yet");
      setNotifyBusy(kind);
      setNotifyMsg(null);
      setErr(null);
      const res = await fetch(`/api/admin/orders/${patchId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // For "on its way" we send the tracking link in the SAME request, so it's
        // saved + sent in one click (no separate "Save status" step).
        body: JSON.stringify({ kind, tracking_url: kind === "on_the_way" ? trackingUrl : undefined }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error || "Could not send the WhatsApp");
      setNotifyMsg(kind === "on_the_way" ? "Sent “on its way” + track link to the customer ✅" : "Sent order details to the customer ✅");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Could not send the WhatsApp");
    } finally {
      setNotifyBusy(null);
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

      {/* Acceptance + customer messages */}
      <section style={{ marginTop: 14, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 16, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900 }}>Acceptance</div>
            <div style={{ marginTop: 4, color: acceptedAt ? "#1F9D57" : "#B26A00", fontWeight: 700 }}>
              {acceptedAt ? `✅ Accepted ${new Date(acceptedAt).toLocaleString()}` : "⏳ Not accepted yet — you’ll be reminded hourly"}
            </div>
          </div>
          {!acceptedAt && (
            <button
              onClick={acceptOrder}
              disabled={acceptBusy}
              style={{ height: 44, padding: "0 22px", borderRadius: 999, border: "none", background: acceptBusy ? "rgba(31,157,87,0.55)" : "#1F9D57", color: "#fff", fontWeight: 900, cursor: acceptBusy ? "not-allowed" : "pointer" }}
            >
              {acceptBusy ? "Accepting…" : "Accept order"}
            </button>
          )}
        </div>

        <div style={{ marginTop: 14, fontWeight: 900 }}>Message the customer</div>

        {/* Paste the tracking link here, then tap "On its way" — it's saved + sent in one go. */}
        <label style={{ display: "grid", gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800 }}>Tracking link</span>
          <input
            value={trackingUrl}
            onChange={(e) => setTrackingUrl(e.target.value)}
            placeholder="Paste the delivery tracking link (e.g. Lalamove / Biteship)…"
            style={{ height: 44, borderRadius: 12, padding: "0 12px", border: "1px solid rgba(0,0,0,0.15)" }}
          />
        </label>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => notifyCustomer("on_the_way")}
            disabled={notifyBusy !== null}
            style={{ height: 44, padding: "0 18px", borderRadius: 999, border: "none", background: notifyBusy ? "rgba(0,20,167,0.55)" : "#0014a7", color: "#fff", fontWeight: 900, cursor: notifyBusy ? "not-allowed" : "pointer" }}
          >
            {notifyBusy === "on_the_way" ? "Sending…" : "🚚 Send “on its way” + link"}
          </button>
          <button
            onClick={() => notifyCustomer("confirm")}
            disabled={notifyBusy !== null}
            style={{ height: 44, padding: "0 18px", borderRadius: 999, border: "1px solid rgba(0,0,0,0.15)", background: "#fff", fontWeight: 900, cursor: notifyBusy ? "not-allowed" : "pointer" }}
          >
            {notifyBusy === "confirm" ? "Sending…" : "Re-send order details"}
          </button>
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
          Tip: paste the link above and tap “On its way” — it’s saved to the order and sent in one step.
        </div>
        {!order.customer_phone && (
          <div style={{ marginTop: 8, color: "#B26A00", fontSize: 13 }}>No customer phone on this order — messages can’t be sent.</div>
        )}
        {notifyMsg && <div style={{ marginTop: 8, color: "#1F9D57", fontWeight: 700 }}>{notifyMsg}</div>}
      </section>

      {order.meta?.gift && (order.meta.gift.message || order.meta.gift.to || order.meta.gift.from) ? (
        <section style={{ marginTop: 14, border: "2px solid #0014A7", borderRadius: 16, padding: 14, background: "#EAF2FF" }}>
          <div style={{ fontWeight: 900, color: "#0014A7" }}>🎁 Gift — handwrite a card (no prices on the box)</div>
          {order.meta.gift.to ? <div style={{ marginTop: 6 }}><b>To:</b> {order.meta.gift.to}</div> : null}
          {order.meta.gift.from ? <div><b>From:</b> {order.meta.gift.from}</div> : null}
          {order.meta.gift.message ? <div style={{ marginTop: 8, fontStyle: "italic", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>&ldquo;{order.meta.gift.message}&rdquo;</div> : null}
        </section>
      ) : null}

      <section style={{ marginTop: 14, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 16, padding: 14 }}>
        <div style={{ fontWeight: 900 }}>Customer{order.recipient_phone || order.recipient_name ? " (buyer)" : ""}</div>
        <div style={{ marginTop: 6 }}>
          <div><b>{order.customer_name || "-"}</b></div>
          <div style={{ color: "rgba(0,0,0,0.7)" }}>{order.customer_phone || ""}</div>
          {order.email ? <div style={{ color: "rgba(0,0,0,0.7)" }}>{order.email}</div> : null}
        </div>

        {(order.recipient_name || order.recipient_phone) ? (
          <>
            <div style={{ marginTop: 12, fontWeight: 900, color: "#0014A7" }}>🎁 Recipient (deliver to)</div>
            <div style={{ marginTop: 6 }}>
              <div><b>{order.recipient_name || "-"}</b></div>
              <div style={{ color: "rgba(0,0,0,0.7)" }}>{order.recipient_phone || ""}</div>
              <div style={{ color: "rgba(0,0,0,0.6)", fontSize: 13, marginTop: 2 }}>Courier contacts the recipient; the “on its way” tracking goes to <b>both</b> the buyer and the recipient.</div>
            </div>
          </>
        ) : null}

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
