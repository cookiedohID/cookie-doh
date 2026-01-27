"use client";

// web/app/admin/stock/StockAdminClient.tsx
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FLAVORS } from "@/lib/catalog";

type Store = { id: string; name: string };
type StockMap = Record<string, Record<string, number>>; // storeId -> flavorId -> qty

const COLORS = { blue: "#0052CC", black: "#101010", sand: "#FAF7F2" };

export default function StockAdminClient() {
  const [stores, setStores] = useState<Store[]>([]);
  const [stock, setStock] = useState<StockMap>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/stock", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) throw new Error(j?.error || "Failed to load");
      setStores(Array.isArray(j?.stores) ? j.stores : []);
      setStock(j?.stock && typeof j.stock === "object" ? j.stock : {});
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const storeCols = useMemo(() => stores, [stores]);

  async function saveQty(storeId: string, flavorId: string, qty: number) {
    const key = `${storeId}:${flavorId}`;
    setBusyKey(key);
    setErr(null);
    try {
      const res = await fetch("/api/admin/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId, flavor_id: flavorId, qty }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) throw new Error(j?.error || "Failed to save");

      setStock((prev) => ({
        ...prev,
        [storeId]: { ...(prev[storeId] || {}), [flavorId]: qty },
      }));
    } catch (e: any) {
      setErr(e?.message || "Failed to save");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#fff" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "22px 16px 80px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 22, color: COLORS.black }}>Admin — Stock per store</h1>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/admin/orders" style={{ color: COLORS.blue, fontWeight: 900, textDecoration: "none" }}>Orders</Link>
            <Link href="/admin/flavors" style={{ color: COLORS.blue, fontWeight: 900, textDecoration: "none" }}>Flavors</Link>
            <Link href="/admin/assortments" style={{ color: COLORS.blue, fontWeight: 900, textDecoration: "none" }}>Assortments</Link>
          </div>
        </div>

        <p style={{ marginTop: 6, color: "#6B6B6B" }}>
          Set stock per store. <b>0 = sold out</b>.
        </p>

        {err ? <div style={{ marginTop: 10, color: "crimson", fontWeight: 900 }}>{err}</div> : null}
        {loading ? <div style={{ marginTop: 10, color: "#6B6B6B", fontWeight: 800 }}>Loading…</div> : null}

        {!loading && storeCols.length > 0 ? (
          <div style={{ marginTop: 14, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 16, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead style={{ background: "rgba(0,0,0,0.03)" }}>
                <tr>
                  <th style={{ padding: 12, textAlign: "left" }}>Flavor</th>
                  {storeCols.map((s) => (
                    <th key={s.id} style={{ padding: 12, textAlign: "left" }}>{s.name}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {FLAVORS.map((f) => (
                  <tr key={f.id} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                    <td style={{ padding: 12, fontWeight: 900 }}>{f.name}</td>

                    {storeCols.map((s) => {
                      const v = stock?.[s.id]?.[f.id] ?? 0;
                      const key = `${s.id}:${f.id}`;
                      const busy = busyKey === key;

                      return (
                        <td key={s.id} style={{ padding: 12 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                              type="number"
                              value={v}
                              min={0}
                              onChange={(e) => {
                                const next = Number(e.target.value);
                                setStock((prev) => ({
                                  ...prev,
                                  [s.id]: { ...(prev[s.id] || {}), [f.id]: Number.isFinite(next) ? next : 0 },
                                }));
                              }}
                              style={{
                                width: 90,
                                height: 40,
                                borderRadius: 12,
                                border: "1px solid rgba(0,0,0,0.12)",
                                padding: "0 10px",
                                outline: "none",
                                background: v === 0 ? "rgba(255,90,0,0.08)" : "#fff",
                                fontWeight: 900,
                              }}
                            />
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => saveQty(s.id, f.id, stock?.[s.id]?.[f.id] ?? 0)}
                              style={{
                                height: 40,
                                borderRadius: 999,
                                border: "none",
                                padding: "0 12px",
                                background: busy ? "rgba(0,82,204,0.45)" : COLORS.blue,
                                color: "#fff",
                                fontWeight: 950,
                                cursor: busy ? "not-allowed" : "pointer",
                              }}
                            >
                              {busy ? "Saving…" : "Save"}
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </main>
  );
}
