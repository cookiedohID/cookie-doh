"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Order = any;
type Item = any;

function toWaNumber(input: string) {
  const digits = (input || "").replace(/[^\d]/g, "");
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  return digits;
}

export default function OrderDetailClient({ id }: { id: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [paymentStatus, setPaymentStatus] = useState<string>("unpaid");
  const [fulfillmentStatus, setFulfillmentStatus] = useState<string>("pending");
  const [trackingUrl, setTrackingUrl] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        const res = await fetch(`/api/admin/orders/${id}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load order");
        setOrder(json.order);
        setItems(json.items || []);

        setPaymentStatus(json.order?.payment_status || "unpaid");
        setFulfillmentStatus(json.order?.fulfillment_status || "pending");
        setTrackingUrl(json.order?.tracking_url || "");
      } catch (e: any) {
        setErr(e?.message || "Failed to load order");
      }
    })();
  }, [id]);

  const total = useMemo(() => {
    const t = order?.total;
    return typeof t === "number" ? t : 0;
  }, [order]);

  const adminWa = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT || "";
  const adminWaDigits = toWaNumber(adminWa);

  const customerMsgThanks = useMemo(() => {
    const name = order?.customer_name || "";
    return `Hi ${name} 🤍\nThank you for your Cookie Doh order!\nWe’re baking your cookies fresh and will update you once they’re on the way 🍪\n\nOrder ID: ${order?.id || ""}`;
  }, [order]);

  const customerMsgOutForDelivery = useMemo(() => {
    const name = order?.customer_name || "";
    const t = trackingUrl || order?.tracking_url || "";
    return `Hi ${name} 🤍\nYour Cookie Doh order is on the way!\nTrack your delivery here:\n${t}\n\nOrder ID: ${order?.id || ""}`;
  }, [order, trackingUrl]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied ✅");
    } catch {
      alert("Copy failed — please copy manually");
    }
  };

  const save = async () => {
    try {
      setSaving(true);
      setErr(null);

      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_status: paymentStatus,
          fulfillment_status: fulfillmentStatus,
          tracking_url: trackingUrl,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to update order");

      setOrder(json.order);
      alert("Saved ✅");
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (err) {
    return (
      <main style={{ padding: 18, maxWidth: 980, margin: "0 auto" }}>
        <Link href="/admin/orders" style={{ color: "#0052CC", fontWeight: 800, textDecoration: "none" }}>
          ← Back
        </Link>
        <div style={{ marginTop: 12, color: "crimson" }}>{err}</div>
      </main>
    );
  }

  if (!order) {
    return (
      <main style={{ padding: 18, maxWidth: 980, margin: "0 auto" }}>
        <Link href="/admin/orders" style={{ color: "#0052CC", fontWeight: 800, textDecoration: "none" }}>
          ← Back
        </Link>
        <div style={{ marginTop: 12, color: "rgba(0,0,0,0.6)" }}>Loading…</div>
      </main>
    );
  }

  return (
    <main style={{ padding: 18, maxWidth: 980, margin: "0 auto" }}>
      <Link href="/admin/orders" style={{ color: "#0052CC", fontWeight: 800, textDecoration: "none" }}>
        ← Back to orders
      </Link>

      <h1 style={{ margin: "10px 0 0", fontSize: 20 }}>Order {order.id}</h1>
      <div style={{ marginTop: 6, color: "rgba(0,0,0,0.7)" }}>
        {order.created_at ? new Date(order.created_at).toLocaleString() : ""}
      </div>

      <section style={{ marginTop: 14, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 16, padding: 14 }}>
        <div style={{ fontWeight: 900 }}>Customer</div>
        <div style={{ marginTop: 6 }}>
          <div><b>{order.customer_name || "-"}</b></div>
          <div style={{ color: "rgba(0,0,0,0.7)" }}>{order.customer_phone || ""}</div>
        </div>

        <div style={{ marginTop: 12, fontWeight: 900 }}>Delivery</div>
        <div style={{ marginTop: 6, color: "rgba(0,0,0,0.75)", lineHeight: 1.5 }}>
          {order.address || "-"}
          {order.building_name ? <div>Building: {order.building_name}</div> : null}
          {order.postal_code ? <div>Postal: {order.postal_code}</div> : null}
          {order.delivery_method ? <div>Method: {order.delivery_method}</div> : null}
        </div>

        <div style={{ marginTop: 12, fontWeight: 900 }}>Items</div>
        <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
          {items.map((it, idx) => (
            <div key={it.id || idx} style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 800 }}>{it.item_name || it.name || it.flavor_name || "Item"}</div>
              <div style={{ color: "rgba(0,0,0,0.75)" }}>× {it.quantity || 0}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontWeight: 900 }}>Total</div>
          <div style={{ fontWeight: 900 }}>Rp {total.toLocaleString("id-ID")}</div>
        </div>
      </section>

      <section style={{ marginTop: 14, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 16, padding: 14 }}>
        <div style={{ fontWeight: 900 }}>Status</div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800 }}>Payment status</span>
            <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} style={{ height: 42, borderRadius: 12, padding: "0 10px" }}>
              <option value="unpaid">unpaid</option>
              <option value="paid">paid</option>
              <option value="refunded">refunded</option>
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
            <span style={{ fontSize: 12, fontWeight: 800 }}>Tracking URL</span>
            <input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="Paste Lalamove tracking link" style={{ height: 42, borderRadius: 12, padding: "0 10px", border: "1px solid rgba(0,0,0,0.15)" }} />
          </label>

          <button
            onClick={save}
            disabled={saving}
            style={{
              height: 48,
              borderRadius: 999,
              border: "none",
              background: saving ? "rgba(0,82,204,0.55)" : "#0052CC",
              color: "#fff",
              fontWeight: 900,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save status"}
          </button>
        </div>
      </section>

      <section style={{ marginTop: 14, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 16, padding: 14 }}>
        <div style={{ fontWeight: 900 }}>Quick WhatsApp</div>
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <button onClick={() => copy(customerMsgThanks)} style={{ height: 46, borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", background: "#fff", fontWeight: 900 }}>
            Copy “Thank you” message
          </button>
          <button onClick={() => copy(customerMsgOutForDelivery)} style={{ height: 46, borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", background: "#fff", fontWeight: 900 }}>
            Copy “Out for delivery” message
          </button>

          {adminWaDigits ? (
            <a
              href={`https://wa.me/${adminWaDigits}`}
              style={{ color: "#0052CC", fontWeight: 900, textDecoration: "none" }}
            >
              Open admin WhatsApp →
            </a>
          ) : (
            <div style={{ color: "rgba(0,0,0,0.6)" }}>
              Set NEXT_PUBLIC_WHATSAPP_SUPPORT in env to show admin WA link.
            </div>
          )}
        </div>
      </section>

      {err ? <div style={{ marginTop: 12, color: "crimson" }}>{err}</div> : null}
    </main>
  );
}
