"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type OrderRow = {
  id?: string; // make optional defensively
  order_no?: string;
  created_at?: string;

  customer_name?: string;
  customer_phone?: string;

  payment_status?: string;
  fullfillment_status?: string;
  shipment_status?: string;

  tracking_url?: string;

  destination_area_label?: string;
  destination_area_id?: string;

  shipping_address?: string;
  building_name?: string;

  subtotal_idr?: number;
  shipping_cost_idr?: number;
  total_idr?: number;
};

const idr = (n?: number) => (typeof n === "number" ? `Rp ${n.toLocaleString("id-ID")}` : "—");

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
    <main style={{ padding: 18, maxWidth: 1260, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Admin — Orders</h1>

      {err && (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", background: "#fff" }}>
          <div style={{ color: "crimson", fontWeight: 900 }}>Admin error</div>
          <div style={{ marginTop: 6, color: "rgba(0,0,0,0.7)" }}>{err}</div>
        </div>
      )}

      <div style={{ marginTop: 14, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 16, overflow: "hidden", background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "rgba(0,0,0,0.03)" }}>
            <tr>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Time</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Order</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Customer</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Destination</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Total</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Payment</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Fulfillment</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Shipment</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Tracking</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }} />
            </tr>
          </thead>

          <tbody>
            {orders.map((o, idx) => {
              const hasId = typeof o.id === "string" && o.id.length > 10;

              return (
                <tr key={o.id || `${o.order_no || "row"}-${idx}`} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                  <td style={{ padding: 12, fontSize: 13, color: "rgba(0,0,0,0.7)", whiteSpace: "nowrap" }}>
                    {o.created_at ? new Date(o.created_at).toLocaleString() : "—"}
                  </td>

                  <td style={{ padding: 12, fontSize: 13, minWidth: 180 }}>
                    <div style={{ fontWeight: 900 }}>{o.order_no || "—"}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
                      {hasId ? o.id : "Missing id"}
                    </div>
                  </td>

                  <td style={{ padding: 12, fontSize: 13, minWidth: 220 }}>
                    <div style={{ fontWeight: 800 }}>{o.customer_name || "—"}</div>
                    <div style={{ color: "rgba(0,0,0,0.6)" }}>{o.customer_phone || ""}</div>
                  </td>

                  <td style={{ padding: 12, fontSize: 13, minWidth: 360 }}>
                    <div style={{ fontWeight: 800, color: "rgba(0,0,0,0.80)" }}>
                      {o.destination_area_label || "—"}
                    </div>
                    <div style={{ color: "rgba(0,0,0,0.6)" }}>{o.shipping_address || "—"}</div>
                    {o.building_name ? (
                      <div style={{ marginTop: 4, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
                        Building: <span style={{ fontWeight: 800 }}>{o.building_name}</span>
                      </div>
                    ) : null}
                  </td>

                  <td style={{ padding: 12, fontSize: 13, fontWeight: 900, whiteSpace: "nowrap" }}>
                    {idr(o.total_idr)}
                  </td>

                  <td style={{ padding: 12, fontSize: 13 }}>{o.payment_status || "—"}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{o.fullfillment_status || "—"}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{o.shipment_status || "—"}</td>

                  <td style={{ padding: 12, fontSize: 13 }}>
                    {o.tracking_url ? (
                      <a href={o.tracking_url} target="_blank" rel="noreferrer" style={{ color: "#0052CC", fontWeight: 800, textDecoration: "none" }}>
                        Open
                      </a>
                    ) : (
                      <span style={{ color: "rgba(0,0,0,0.45)" }}>—</span>
                    )}
                  </td>

                  <td style={{ padding: 12, fontSize: 13 }}>
                    {hasId ? (
                      <Link href={`/admin/orders/${o.id}`} style={{ color: "#0052CC", fontWeight: 800, textDecoration: "none" }}>
                        View →
                      </Link>
                    ) : (
                      <span style={{ color: "rgba(0,0,0,0.45)" }}>No link</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {orders.length === 0 && !err && (
              <tr>
                <td colSpan={10} style={{ padding: 16, color: "rgba(0,0,0,0.6)" }}>
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
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type OrderRow = {
  id: string;
  order_no?: string;
  created_at?: string;

  customer_name?: string;
  customer_phone?: string;

  payment_status?: string;
  fullfillment_status?: string;
  shipment_status?: string;

  tracking_url?: string;

  destination_area_label?: string;
  destination_area_id?: string;

  shipping_address?: string;
  building_name?: string;

  subtotal_idr?: number;
  shipping_cost_idr?: number;
  total_idr?: number;
};

const idr = (n?: number) =>
  typeof n === "number" ? `Rp ${n.toLocaleString("id-ID")}` : "—";

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
    <main style={{ padding: 18, maxWidth: 1260, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Admin — Orders</h1>
      <p style={{ marginTop: 6, color: "rgba(0,0,0,0.6)" }}>
        View orders + update status + create shipment.
      </p>

      {err && (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", background: "#fff" }}>
          <div style={{ color: "crimson", fontWeight: 900 }}>Admin error</div>
          <div style={{ marginTop: 6, color: "rgba(0,0,0,0.7)" }}>{err}</div>
        </div>
      )}

      <div style={{ marginTop: 14, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 16, overflow: "hidden", background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "rgba(0,0,0,0.03)" }}>
            <tr>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Time</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Order</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Customer</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Destination</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Total</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Payment</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Fulfillment</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Shipment</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Tracking</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }} />
            </tr>
          </thead>

          <tbody>
            {orders.map((o) => (
              <tr key={o.id} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                <td style={{ padding: 12, fontSize: 13, color: "rgba(0,0,0,0.7)", whiteSpace: "nowrap" }}>
                  {o.created_at ? new Date(o.created_at).toLocaleString() : "—"}
                </td>

                <td style={{ padding: 12, fontSize: 13, minWidth: 160 }}>
                  <div style={{ fontWeight: 900 }}>{o.order_no || "—"}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>{o.id}</div>
                </td>

                <td style={{ padding: 12, fontSize: 13, minWidth: 220 }}>
                  <div style={{ fontWeight: 800 }}>{o.customer_name || "—"}</div>
                  <div style={{ color: "rgba(0,0,0,0.6)" }}>{o.customer_phone || ""}</div>
                </td>

                <td style={{ padding: 12, fontSize: 13, minWidth: 360 }}>
                  <div style={{ fontWeight: 800, color: "rgba(0,0,0,0.80)" }}>
                    {o.destination_area_label || "—"}
                  </div>
                  <div style={{ color: "rgba(0,0,0,0.6)" }}>{o.shipping_address || "—"}</div>
                  {o.building_name ? (
                    <div style={{ marginTop: 4, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
                      Building: <span style={{ fontWeight: 800 }}>{o.building_name}</span>
                    </div>
                  ) : null}
                </td>

                <td style={{ padding: 12, fontSize: 13, fontWeight: 900, whiteSpace: "nowrap" }}>
                  {idr(o.total_idr)}
                </td>

                <td style={{ padding: 12, fontSize: 13 }}>{o.payment_status || "—"}</td>
                <td style={{ padding: 12, fontSize: 13 }}>{o.fullfillment_status || "—"}</td>
                <td style={{ padding: 12, fontSize: 13 }}>{o.shipment_status || "—"}</td>

                <td style={{ padding: 12, fontSize: 13 }}>
                  {o.tracking_url ? (
                    <a href={o.tracking_url} target="_blank" rel="noreferrer" style={{ color: "#0052CC", fontWeight: 800, textDecoration: "none" }}>
                      Open
                    </a>
                  ) : (
                    <span style={{ color: "rgba(0,0,0,0.45)" }}>—</span>
                  )}
                </td>

                <td style={{ padding: 12, fontSize: 13 }}>
                  <Link href={`/admin/orders/${o.id}`} style={{ color: "#0052CC", fontWeight: 800, textDecoration: "none" }}>
                    View →
                  </Link>
                </td>
              </tr>
            ))}

            {orders.length === 0 && !err && (
              <tr>
                <td colSpan={10} style={{ padding: 16, color: "rgba(0,0,0,0.6)" }}>
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

/*

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type OrderRow = {
  id: string;
  created_at?: string;

  customer_name?: string;
  customer_phone?: string;

  payment_status?: string;
  fulfillment_status?: string;

  shipping_address?: string;
  building_name?: string;
  destination_area_id?: string;
  destination_area_label?: string;

  tracking_url?: string;
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
    <main style={{ padding: 18, maxWidth: 1180, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Admin — Orders</h1>
      <p style={{ marginTop: 6, color: "rgba(0,0,0,0.6)" }}>
        View orders + update status + create shipment (Lalamove).
      </p>

      {err && (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", background: "#fff" }}>
          <div style={{ color: "crimson", fontWeight: 900 }}>Admin error</div>
          <div style={{ marginTop: 6, color: "rgba(0,0,0,0.7)" }}>{err}</div>
        </div>
      )}

      <div style={{ marginTop: 14, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 16, overflow: "hidden", background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "rgba(0,0,0,0.03)" }}>
            <tr>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Time</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Customer</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Destination</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Payment</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Fulfillment</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Tracking</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }} />
            </tr>
          </thead>

          <tbody>
            {orders.map((o) => (
              <tr key={o.id} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                <td style={{ padding: 12, fontSize: 13, color: "rgba(0,0,0,0.7)", whiteSpace: "nowrap" }}>
                  {o.created_at ? new Date(o.created_at).toLocaleString() : "-"}
                </td>

                <td style={{ padding: 12, fontSize: 13, minWidth: 220 }}>
                  <div style={{ fontWeight: 800 }}>{o.customer_name || "-"}</div>
                  <div style={{ color: "rgba(0,0,0,0.6)" }}>{o.customer_phone || ""}</div>
                  <div style={{ marginTop: 6, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
                    ID: <span style={{ fontWeight: 800 }}>{o.id}</span>
                  </div>
                </td>

                <td style={{ padding: 12, fontSize: 13, minWidth: 340 }}>
                  <div style={{ fontWeight: 800, color: "rgba(0,0,0,0.80)" }}>
                    {o.destination_area_label || "-"}
                  </div>
                  <div style={{ color: "rgba(0,0,0,0.6)" }}>{o.shipping_address || "-"}</div>
                  {o.building_name ? (
                    <div style={{ marginTop: 4, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
                      Building: <span style={{ fontWeight: 800 }}>{o.building_name}</span>
                    </div>
                  ) : null}
                </td>

                <td style={{ padding: 12, fontSize: 13 }}>{o.payment_status || "-"}</td>
                <td style={{ padding: 12, fontSize: 13 }}>{o.fulfillment_status || "-"}</td>

                <td style={{ padding: 12, fontSize: 13 }}>
                  {o.tracking_url ? (
                    <a href={o.tracking_url} target="_blank" rel="noreferrer" style={{ color: "#0052CC", fontWeight: 800, textDecoration: "none" }}>
                      Open
                    </a>
                  ) : (
                    <span style={{ color: "rgba(0,0,0,0.45)" }}>—</span>
                  )}
                </td>

                <td style={{ padding: 12, fontSize: 13 }}>
                  <Link href={`/admin/orders/${o.id}`} style={{ color: "#0052CC", fontWeight: 800, textDecoration: "none" }}>
                    View →
                  </Link>
                </td>
              </tr>
            ))}

            {orders.length === 0 && !err && (
              <tr>
                <td colSpan={7} style={{ padding: 16, color: "rgba(0,0,0,0.6)" }}>
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

/*
// web/app/admin/orders/page.tsx
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

  // ✅ your real schema fields
  shipping_address?: string;
  building_name?: string;
  destination_area_id?: string;
  destination_area_label?: string;

  tracking_url?: string;
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
    <main style={{ padding: 18, maxWidth: 1180, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Admin — Orders</h1>
      <p style={{ marginTop: 6, color: "rgba(0,0,0,0.6)" }}>
        View orders + update status + create shipment (Lalamove).
      </p>

      {err && (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.12)",
            background: "#fff",
          }}
        >
          <div style={{ color: "crimson", fontWeight: 900 }}>Admin error</div>
          <div style={{ marginTop: 6, color: "rgba(0,0,0,0.7)" }}>{err}</div>
          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(0,0,0,0.6)" }}>
            If this is production, check Vercel env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 14,
          border: "1px solid rgba(0,0,0,0.10)",
          borderRadius: 16,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "rgba(0,0,0,0.03)" }}>
            <tr>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Time</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Customer</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Destination</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Total</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Payment</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Fulfillment</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }}>Tracking</th>
              <th style={{ textAlign: "left", padding: 12, fontSize: 12 }} />
            </tr>
          </thead>

          <tbody>
            {orders.map((o) => (
              <tr key={o.id} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                <td style={{ padding: 12, fontSize: 13, color: "rgba(0,0,0,0.7)", whiteSpace: "nowrap" }}>
                  {o.created_at ? new Date(o.created_at).toLocaleString() : "-"}
                </td>

                <td style={{ padding: 12, fontSize: 13, minWidth: 220 }}>
                  <div style={{ fontWeight: 800 }}>{o.customer_name || "-"}</div>
                  <div style={{ color: "rgba(0,0,0,0.6)" }}>{o.customer_phone || ""}</div>
                  <div style={{ marginTop: 6, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
                    ID: <span style={{ fontWeight: 800 }}>{o.id}</span>
                  </div>
                </td>

                <td style={{ padding: 12, fontSize: 13, minWidth: 320 }}>
                  <div style={{ fontWeight: 800, color: "rgba(0,0,0,0.80)" }}>
                    {o.destination_area_label || "-"}
                  </div>
                  <div style={{ color: "rgba(0,0,0,0.6)" }}>
                    {o.shipping_address || "-"}
                  </div>
                  {o.building_name ? (
                    <div style={{ marginTop: 4, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
                      Building: <span style={{ fontWeight: 800 }}>{o.building_name}</span>
                    </div>
                  ) : null}
                </td>

                <td style={{ padding: 12, fontSize: 13, fontWeight: 800, whiteSpace: "nowrap" }}>
                  {typeof o.total === "number" ? `Rp ${o.total.toLocaleString("id-ID")}` : "-"}
                </td>

                <td style={{ padding: 12, fontSize: 13 }}>{o.payment_status || "-"}</td>

                <td style={{ padding: 12, fontSize: 13 }}>{o.fulfillment_status || "-"}</td>

                <td style={{ padding: 12, fontSize: 13 }}>
                  {o.tracking_url ? (
                    <a
                      href={o.tracking_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#0052CC", fontWeight: 800, textDecoration: "none" }}
                    >
                      Open
                    </a>
                  ) : (
                    <span style={{ color: "rgba(0,0,0,0.45)" }}>—</span>
                  )}
                </td>

                <td style={{ padding: 12, fontSize: 13 }}>
                  <Link
                    href={`/admin/orders/${o.id}`}
                    style={{ color: "#0052CC", fontWeight: 800, textDecoration: "none" }}
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}

            {orders.length === 0 && !err && (
              <tr>
                <td colSpan={8} style={{ padding: 16, color: "rgba(0,0,0,0.6)" }}>
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

/*

//web/app/admin/orders/page.tsx

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

*/

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