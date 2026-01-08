"use client";

import { useEffect, useMemo, useState } from "react";

type AdminOrder = {
  id: string;
  order_no: string | null;
  midtrans_order_id: string;
  customer_name: string;
  customer_phone: string;
  total_idr: number | null;
  payment_status: string;
  shipment_status: string | null;
  biteship_order_id: string | null;
  waybill: string | null;
  tracking_url: string | null;
  created_at: string;
  courier_company: string | null;
  courier_type: string | null;
  courier_code: string | null;
  courier_service: string | null;
  postal: string | null;
  destination_area_id: string | null;
};

export default function OrdersClient() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ✅ new: filter toggle
  const [onlyPaidNotShipped, setOnlyPaidNotShipped] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/orders", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load orders");
      setOrders(json.orders ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    let list = orders;

    if (onlyPaidNotShipped) {
      list = list.filter((o) => {
        const paid = String(o.payment_status ?? "").toUpperCase() === "PAID";
        const shipped = Boolean(o.biteship_order_id);
        const fulfilled = String(o.shipment_status ?? "").toLowerCase() === "fulfilled";
        return paid && !shipped && !fulfilled;
      });
    }

    if (!s) return list;

    return list.filter((o) => {
      const hay = [
        o.order_no ?? "",
        o.midtrans_order_id ?? "",
        o.customer_name ?? "",
        o.customer_phone ?? "",
        o.payment_status ?? "",
        o.shipment_status ?? "",
        o.biteship_order_id ?? "",
        o.waybill ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [orders, q, onlyPaidNotShipped]);

  async function markPaid(midtrans_order_id: string) {
    setBusyId(midtrans_order_id);
    setErr(null);
    try {
      const res = await fetch("/api/admin/orders/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ midtrans_order_id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Mark Paid failed");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Mark Paid failed");
    } finally {
      setBusyId(null);
    }
  }

  async function markFulfilled(midtrans_order_id: string) {
    setBusyId(midtrans_order_id);
    setErr(null);
    try {
      const res = await fetch("/api/admin/orders/mark-fulfilled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ midtrans_order_id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Mark Fulfilled failed");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Mark Fulfilled failed");
    } finally {
      setBusyId(null);
    }
  }

  async function createShipment(midtrans_order_id: string) {
    setBusyId(midtrans_order_id);
    setErr(null);
    try {
      const res = await fetch("/api/admin/shipments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ midtrans_order_id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Create shipment failed");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Create shipment failed");
    } finally {
      setBusyId(null);
    }
  }

  async function retryShipment(midtrans_order_id: string) {
    setBusyId(midtrans_order_id);
    setErr(null);
    try {
      const res = await fetch("/api/admin/shipments/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ midtrans_order_id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Retry failed");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Retry failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-md">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search order no / midtrans id / name / phone / waybill…"
            className="w-full rounded-2xl border bg-white px-4 py-2 text-sm outline-none focus:ring-2"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={onlyPaidNotShipped}
              onChange={(e) => setOnlyPaidNotShipped(e.target.checked)}
            />
            PAID & Not Shipped
          </label>

          <button
            onClick={load}
            className="rounded-2xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Refresh
          </button>
        </div>
      </div>

      {err ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[1280px] text-left text-sm">
          <thead className="text-xs text-neutral-500">
            <tr className="border-b">
              <th className="py-3 pr-3">Order</th>
              <th className="py-3 pr-3">Customer</th>
              <th className="py-3 pr-3">Total</th>
              <th className="py-3 pr-3">Payment</th>
              <th className="py-3 pr-3">Shipment</th>
              <th className="py-3 pr-3">Waybill</th>
              <th className="py-3 pr-3">Created</th>
              <th className="py-3 pr-3">Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className="py-6 text-neutral-500" colSpan={8}>
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="py-6 text-neutral-500" colSpan={8}>
                  No orders found.
                </td>
              </tr>
            ) : (
              filtered.map((o) => {
                const paid = String(o.payment_status ?? "").toUpperCase() === "PAID";
                const fulfilled = String(o.shipment_status ?? "").toLowerCase() === "fulfilled";
                const hasShipment = Boolean(o.biteship_order_id);
                const canCreateShipment = paid && !hasShipment;
                const canRetry = paid && !hasShipment;

                return (
                  <tr key={o.id} className="border-b last:border-0">
                    <td className="py-3 pr-3">
                      <div className="font-medium">{o.order_no ?? "-"}</div>
                      <div className="mt-1 font-mono text-xs text-neutral-500">{o.midtrans_order_id}</div>
                    </td>

                    <td className="py-3 pr-3">
                      <div className="font-medium">{o.customer_name}</div>
                      <div className="mt-1 text-xs text-neutral-500">{o.customer_phone}</div>
                    </td>

                    <td className="py-3 pr-3">
                      {typeof o.total_idr === "number" ? `Rp ${o.total_idr.toLocaleString("id-ID")}` : "-"}
                    </td>

                    <td className="py-3 pr-3">
                      <span className="rounded-xl border px-2 py-1 text-xs">{o.payment_status}</span>
                    </td>

                    <td className="py-3 pr-3">
                      <div className="text-xs">
                        <span className="rounded-xl border px-2 py-1">{o.shipment_status ?? "-"}</span>
                      </div>
                      <div className="mt-1 font-mono text-xs text-neutral-500">{o.biteship_order_id ?? ""}</div>
                    </td>

                    <td className="py-3 pr-3 text-xs">
                      {o.waybill ? (
                        o.tracking_url ? (
                          <a className="underline" href={o.tracking_url} target="_blank" rel="noreferrer">
                            {o.waybill}
                          </a>
                        ) : (
                          o.waybill
                        )
                      ) : o.tracking_url ? (
                        <a className="underline" href={o.tracking_url} target="_blank" rel="noreferrer">
                          Tracking
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td className="py-3 pr-3 text-xs text-neutral-500">
                      {new Date(o.created_at).toLocaleString("id-ID")}
                    </td>

                    <td className="py-3 pr-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          disabled={paid || busyId === o.midtrans_order_id}
                          onClick={() => markPaid(o.midtrans_order_id)}
                          className="rounded-2xl border bg-white px-3 py-2 text-xs font-semibold shadow-sm hover:bg-neutral-100 disabled:opacity-50"
                        >
                          {busyId === o.midtrans_order_id ? "Working…" : "Mark Paid"}
                        </button>

                        <button
                          disabled={!canCreateShipment || busyId === o.midtrans_order_id}
                          onClick={() => createShipment(o.midtrans_order_id)}
                          className="rounded-2xl border bg-white px-3 py-2 text-xs font-semibold shadow-sm hover:bg-neutral-100 disabled:opacity-50"
                        >
                          {busyId === o.midtrans_order_id ? "Working…" : "Create Shipment"}
                        </button>

                        <button
                          disabled={!canRetry || busyId === o.midtrans_order_id}
                          onClick={() => retryShipment(o.midtrans_order_id)}
                          className="rounded-2xl border bg-white px-3 py-2 text-xs font-semibold shadow-sm hover:bg-neutral-100 disabled:opacity-50"
                          title="Retry is for PAID orders with no shipment id"
                        >
                          Retry
                        </button>

                        <button
                          disabled={!paid || busyId === o.midtrans_order_id || fulfilled}
                          onClick={() => markFulfilled(o.midtrans_order_id)}
                          className="rounded-2xl border bg-white px-3 py-2 text-xs font-semibold shadow-sm hover:bg-neutral-100 disabled:opacity-50"
                          title="Use after you’ve packed + handed off / completed delivery"
                        >
                          {busyId === o.midtrans_order_id ? "Working…" : fulfilled ? "Fulfilled ✅" : "Mark Fulfilled"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-neutral-500">
        Ops flow: <span className="font-medium">Mark Paid</span> → <span className="font-medium">Create Shipment</span> →{" "}
        <span className="font-medium">Mark Fulfilled</span>.
      </div>
    </div>
  );
}
