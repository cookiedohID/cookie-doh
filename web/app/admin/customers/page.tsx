"use client";

// web/app/admin/customers/page.tsx
import { useEffect, useState } from "react";
import Link from "next/link";
import { COLORS } from "@/lib/theme";

const formatIDR = (n?: number | null) =>
  typeof n === "number"
    ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
    : "-";

const formatDate = (s?: string | null) => {
  if (!s) return "-";
  try {
    return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "-";
  }
};

type Customer = { id: string; phone: string; name: string | null; email: string | null; last_order_at: string | null };
type OrderRow = { id: string; order_no: string; total_idr: number | null; payment_status: string; created_at: string };

export default function CustomersAdminPage() {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [stats, setStats] = useState<{ orders: number; totalSpent: number } | null>(null);
  const [loyalty, setLoyalty] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/customers?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        setList(Array.isArray(j?.customers) ? j.customers : []);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [q]);

  async function openCustomer(c: Customer) {
    setSelected(c);
    setDetailLoading(true);
    setOrders([]);
    setStats(null);
    try {
      const res = await fetch(`/api/admin/customers/${c.id}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      setOrders(Array.isArray(j?.orders) ? j.orders : []);
      setStats(j?.stats || null);
      setLoyalty(j?.loyalty || null);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#fff" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "22px 16px 80px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 22, color: COLORS.black }}>Admin · Customers</h1>
          <div style={{ display: "flex", gap: 14 }}>
            <Link href="/admin/flavors" style={{ color: COLORS.blue, fontWeight: 900, textDecoration: "none" }}>Inventory →</Link>
            <Link href="/admin/orders" style={{ color: COLORS.blue, fontWeight: 900, textDecoration: "none" }}>Orders →</Link>
          </div>
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name…"
          style={{ marginTop: 14, width: "100%", padding: "11px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.16)", fontSize: 15 }}
        />

        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          {loading ? (
            <div style={{ color: "#6B6B6B", fontWeight: 700, fontSize: 13 }}>Loading…</div>
          ) : list.length === 0 ? (
            <div style={{ color: "#6B6B6B", fontSize: 13 }}>No customers found.</div>
          ) : (
            list.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openCustomer(c)}
                style={{
                  textAlign: "left",
                  border: selected?.id === c.id ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.10)",
                  borderRadius: 14,
                  padding: "12px 14px",
                  background: COLORS.white,
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, color: COLORS.black }}>{c.name || "(no name)"}</div>
                  <div style={{ fontSize: 12.5, color: "#6B6B6B" }}>{c.phone}{c.email ? ` · ${c.email}` : ""}</div>
                </div>
                <div style={{ fontSize: 12, color: "#6B6B6B", whiteSpace: "nowrap" }}>
                  Last: {formatDate(c.last_order_at)}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Detail */}
        {selected ? (
          <div style={{ marginTop: 22, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 16, padding: 16, background: COLORS.sand }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18, color: COLORS.black }}>{selected.name || "(no name)"}</div>
                <div style={{ fontSize: 13, color: "#6B6B6B" }}>{selected.phone}{selected.email ? ` · ${selected.email}` : ""}</div>
              </div>
              {stats ? (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 900, color: COLORS.blue }}>{formatIDR(stats.totalSpent)}</div>
                  <div style={{ fontSize: 12, color: "#6B6B6B" }}>{stats.orders} order{stats.orders === 1 ? "" : "s"}</div>
                </div>
              ) : null}
            </div>

            {loyalty ? (
              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { label: "🍪 Cookies", stamps: loyalty.cookieStamps, free: loyalty.freeCookies },
                  { label: "🥤 Drinks", stamps: loyalty.drinkStamps, free: loyalty.freeDrinks },
                ].map((row) => (
                  <div key={row.label} style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontWeight: 800, fontSize: 13, color: COLORS.black }}>{row.label}</span>
                      <span style={{ fontSize: 12, color: "#6B6B6B" }}>{row.stamps}/10</span>
                    </div>
                    <div style={{ marginTop: 6, height: 8, borderRadius: 999, background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
                      <div style={{ width: `${(row.stamps / 10) * 100}%`, height: "100%", background: COLORS.blue }} />
                    </div>
                    {row.free > 0 ? (
                      <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: "#127a3e" }}>
                        🎁 {row.free} free available
                      </div>
                    ) : (
                      <div style={{ marginTop: 6, fontSize: 12, color: "#6B6B6B" }}>{10 - row.stamps} to next free</div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            <div style={{ marginTop: 14, fontWeight: 800, fontSize: 13, color: COLORS.black }}>Purchase history</div>
            <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
              {detailLoading ? (
                <div style={{ color: "#6B6B6B", fontSize: 13 }}>Loading…</div>
              ) : orders.length === 0 ? (
                <div style={{ color: "#6B6B6B", fontSize: 13 }}>No orders yet.</div>
              ) : (
                orders.map((o) => (
                  <Link
                    key={o.id}
                    href={`/admin/orders/${o.id}`}
                    style={{
                      textDecoration: "none",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 12,
                      background: "#fff",
                      border: "1px solid rgba(0,0,0,0.08)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, color: COLORS.black, fontSize: 13.5 }}>{o.order_no || o.id.slice(0, 8)}</div>
                      <div style={{ fontSize: 12, color: "#6B6B6B" }}>{formatDate(o.created_at)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 800, color: COLORS.black, fontSize: 13.5 }}>{formatIDR(o.total_idr)}</div>
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: String(o.payment_status).toUpperCase() === "PAID" ? "#127a3e" : COLORS.muted }}>
                        {o.payment_status}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
