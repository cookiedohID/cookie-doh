"use client";

// web/app/admin/stock/StockAdminClient.tsx
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FLAVORS } from "@/lib/catalog";

type Store = { id: string; name: string };
type StockMap = Record<string, Record<string, number>>;

const COLORS = {
  blue: "#0014A7",
  black: "#101010",
  white: "#FFFFFF",
  sand: "#FAF7F2",
};

async function fetchJsonWithTimeout(url: string, ms = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);

  try {
    const res = await fetch(url, { cache: "no-store", signal: ac.signal });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { res, json, text };
  } finally {
    clearTimeout(t);
  }
}

export default function StockAdminClient() {
  const [stores, setStores] = useState<Store[]>([]);
  const [stock, setStock] = useState<StockMap>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [debug, setDebug] = useState<string | null>(null);

  const storeCols = useMemo(() => stores, [stores]);

  const load = async () => {
    setLoading(true);
    setErr(null);
    setDebug(null);

    try {
      const { res, json, text } = await fetchJsonWithTimeout("/api/admin/stock", 8000);

      if (!res.ok) {
        setErr(`Failed to load stock (HTTP ${res.status})`);
        setDebug(text.slice(0, 1200));
        setStores([]);
        setStock({});
        return;
      }

      if (!json || json.ok !== true) {
        setErr(json?.error || "Failed to load stock (invalid response)");
        setDebug(text.slice(0, 1200));
        setStores([]);
        setStock({});
        return;
      }

      setStores(Array.isArray(json.stores) ? json.stores : []);
      setStock(json.stock && typeof json.stock === "object" ? json.stock : {});
    } catch (e: any) {
      if (e?.name === "AbortError") {
        setErr("Stock API timed out (8s).");
      } else {
        setErr(e?.message || "Failed to load stock.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveQty = async (storeId: string, flavorId: string, qty: number) => {
    const key = `${storeId}:${flavorId}`;
    setBusyKey(key);
    setErr(null);
    setDebug(null);

    try {
      const res = await fetch("/api/admin/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId, flavor_id: flavorId, qty }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!res.ok || !json || json.ok !== true) {
        setErr(json?.error || `Failed to save (HTTP ${res.status})`);
        setDebug(text.slice(0, 1200));
        return;
      }

      setStock((prev) => ({
        ...prev,
        [storeId]: { ...(prev[storeId] || {}), [flavorId]: qty },
      }));
    } catch (e: any) {
      setErr(e?.message || "Failed to save.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: COLORS.white }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "22px 16px 80px" }}>
        {/* Admin nav */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 22, color: COLORS.black }}>Admin — Stock</h1>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/admin/orders" style={{ color: COLORS.blue, fontWeight: 900, textDecoration: "none" }}>Orders</Link>
            <Link href="/admin/flavors" style={{ color: COLORS.blue, fontWeight: 900, textDecoration: "none" }}>Flavors</Link>
            <Link href="/admin/assortments" style={{ color: COLORS.blue, fontWeight: 900, textDecoration: "none" }}>Assortments</Link>
            <Link href="/admin/stock" style={{ color: COLORS.blue, fontWeight: 900, textDecoration: "none" }}>Stock</Link>
          </div>
        </div>

        <p style={{ marginTop: 6, color: "#6B6B6B" }}>
          Set stock per store. <b>0 = sold out</b>.
        </p>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={load}
            style={{
              height: 40,
              padding: "0 14px",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "#fff",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Reload
          </button>

          <a
            href="/api/admin/stock"
            target="_blank"
            rel="noreferrer"
            style={{
              height: 40,
              display: "inline-flex",
              alignItems: "center",
              padding: "0 14px",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "#fff",
              fontWeight: 900,
              textDecoration: "none",
              color: COLORS.black,
            }}
          >
            Open API
          </a>
        </div>

        {loading ? (
          <div style={{ marginTop: 10, color: "#6B6B6B", fontWeight: 800 }}>Loading…</div>
        ) : null}

        {err ? (
          <div style={{ marginTop: 12, color: "crimson", fontWeight: 950 }}>
            {err}
            {debug ? (
              <pre
                style={{
                  marginTop: 10,
                  background: "rgba(0,0,0,0.04)",
                  padding: 12,
                  borderRadius: 12,
                  overflow: "auto",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#111",
                  whiteSpace: "pre-wrap",
                }}
              >
                {debug}
              </pre>
            ) : null}
          </div>
        ) : null}

        {!loading && !err && storeCols.length > 0 ? (
          <div style={{ marginTop: 14, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 16, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead style={{ background: "rgba(0,0,0,0.03)" }}>
                <tr>
                  <th style={{ padding: 12, textAlign: "left" }}>Flavor</th>
                  {storeCols.map((s) => (
                    <th key={s.id} style={{ padding: 12, textAlign: "left" }}>
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {FLAVORS.map((f: any) => (
                  <tr key={f.id} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                    <td style={{ padding: 12, fontWeight: 900, color: COLORS.black }}>{f.name}</td>

                    {storeCols.map((s) => {
                      const v = stock?.[s.id]?.[f.id] ?? 0;
                      const key = `${s.id}:${f.id}`;
                      const busy = busyKey === key;

                      return (
                        <td key={s.id} style={{ padding: 12 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                              type="number"
                              min={0}
                              value={v}
                              onChange={(e) => {
                                const next = Number(e.target.value);
                                const safe = Number.isFinite(next) && next >= 0 ? Math.floor(next) : 0;
                                setStock((prev) => ({
                                  ...prev,
                                  [s.id]: { ...(prev[s.id] || {}), [f.id]: safe },
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
                                background: busy ? "rgba(0,20,167,0.45)" : COLORS.blue,
                                color: "#fff",
                                fontWeight: 950,
                                cursor: busy ? "not-allowed" : "pointer",
                                boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
                              }}
                            >
                              {busy ? "Saving…" : "Save"}
                            </button>
                          </div>

                          <div style={{ marginTop: 6, fontSize: 11, fontWeight: 800, color: "rgba(0,0,0,0.55)" }}>
                            {v === 0 ? "Sold out" : "Available"}
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

        <div style={{ marginTop: 14, color: "rgba(0,0,0,0.55)", fontWeight: 800, fontSize: 12 }}>
          Tip: If a flavor is missing in a store, it’s treated as stock <b>0</b> until you set it.
        </div>
      </div>
    </main>
  );
}
