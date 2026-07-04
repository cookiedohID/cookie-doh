"use client";

// web/components/TbsCartSection.tsx — the TotalBuahStore half of the unified
// cart ("two tables, one checkout" — owner decision 2026-07-04). Renders the
// customer's TBS basket as its own branded section inside /cart and the
// checkout summary. Ships together with the Cookie Doh items from the same
// TBS store. Hidden when the basket is empty or the shop is gated off.
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  RED, GREEN, rp, loadBasket, saveBasket, TBS_FALLBACK_STORES, type BasketLine,
} from "@/app/tbs/shared";

export function useTbsBasket() {
  const [store, setStore] = useState("");
  const [lines, setLines] = useState<BasketLine[]>([]);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const refresh = () => {
      const st = localStorage.getItem("tbs_store") || "";
      setStore(st);
      setLines(st ? Object.values(loadBasket(st)) : []);
    };
    refresh();
    fetch("/api/tbs/enabled", { cache: "no-store" })
      .then((r) => r.json()).then((j) => setEnabled(Boolean(j?.enabled)))
      .catch(() => setEnabled(false));
    window.addEventListener("tbs-basket", refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("tbs-basket", refresh); window.removeEventListener("focus", refresh); };
  }, []);
  const subtotal = lines.reduce((n, l) => n + l.qty * l.price, 0);
  const storeName = TBS_FALLBACK_STORES.find((s) => s.code === store)?.name || store;
  return { store, storeName, lines, subtotal, enabled };
}

export default function TbsCartSection({ compact = false }: { compact?: boolean }) {
  const { store, storeName, lines, subtotal, enabled } = useTbsBasket();
  if (!enabled || !store || lines.length === 0) return null;

  const setQty = (sku: string, qty: number) => {
    const items = loadBasket(store);
    if (qty <= 0) delete items[sku];
    else if (items[sku]) items[sku] = { ...items[sku], qty: Math.min(99, qty) };
    saveBasket(store, items);
  };

  return (
    <section style={{ marginTop: 16, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderTop: `4px solid ${RED}`, borderRadius: 16, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <div>
          <span style={{ fontWeight: 900, color: GREEN, fontSize: 15 }}>🍒 TotalBuahStore</span>
          <span style={{ fontSize: 12, color: "#888", marginLeft: 8 }}>from {storeName} — ships together with your cookies</span>
        </div>
        <Link href="/tbs" style={{ fontSize: 12.5, color: RED, fontWeight: 700, textDecoration: "none" }}>+ add more</Link>
      </div>
      <div style={{ padding: "0 16px 12px" }}>
        {lines.map((l) => (
          <div key={l.sku} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid rgba(0,0,0,0.06)", fontSize: 13 }}>
            <div style={{ minWidth: 0 }}>
              <Link href={`/tbs/p/${encodeURIComponent(l.sku.split("@")[0])}`} style={{ textDecoration: "none", color: "#333", lineHeight: 1.35, display: "block" }}>{l.name}</Link>
              <div style={{ fontSize: 12, color: "#999" }}>{rp(l.price)} / {l.unit}</div>
            </div>
            {compact ? (
              <span style={{ flex: "0 0 auto", fontSize: 13, color: "#333" }}>× {l.qty} · <b>{rp(l.qty * l.price)}</b></span>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
                <button onClick={() => setQty(l.sku, l.qty - 1)} aria-label="less" style={{ border: `1px solid ${GREEN}`, background: "#fff", color: GREEN, borderRadius: 999, width: 26, height: 26, fontWeight: 900, cursor: "pointer" }}>−</button>
                <span style={{ fontWeight: 700, minWidth: 16, textAlign: "center" }}>{l.qty}</span>
                <button onClick={() => setQty(l.sku, l.qty + 1)} aria-label="more" style={{ border: "none", background: GREEN, color: "#fff", borderRadius: 999, width: 26, height: 26, fontWeight: 900, cursor: "pointer" }}>+</button>
              </div>
            )}
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 2px", borderTop: "1px solid rgba(0,0,0,0.08)", fontSize: 14 }}>
          <span style={{ color: "#666" }}>TotalBuahStore subtotal</span>
          <span style={{ fontWeight: 700, color: "#191919" }}>{rp(subtotal)}</span>
        </div>
      </div>
    </section>
  );
}
