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

export type BasketIssue = { type: "out" | "short" | "gone"; stock: number };

export function useTbsBasket() {
  const [store, setStore] = useState("");
  const [lines, setLines] = useState<BasketLine[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [issues, setIssues] = useState<Record<string, BasketIssue>>({});
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

  // AUTO-REFRESH: revalidate the basket against live stock (mount, focus,
  // basket changes, and every 60s). Prices are silently updated to current;
  // stock problems become per-line issues the UIs render + gate checkout on.
  useEffect(() => {
    if (!store || lines.length === 0) { setIssues({}); return; }
    let alive = true;
    const check = async () => {
      try {
        const skus = lines.map((l) => l.sku).join(",");
        const j = await (await fetch(`/api/tbs/stock?store=${encodeURIComponent(store)}&skus=${encodeURIComponent(skus)}`, { cache: "no-store" })).json();
        if (!alive || !j?.ok || !Array.isArray(j.items)) return;
        const bySku = new Map(j.items.map((x: any) => [String(x.sku), x]));
        const next: Record<string, BasketIssue> = {};
        const stockLive = j.items.some((x: any) => x.stockLive);
        let priceChanged = false;
        const stored = loadBasket(store);
        for (const l of lines) {
          const x: any = bySku.get(l.sku);
          if (!x || !(Number(x.price) > 0)) { next[l.sku] = { type: "gone", stock: 0 }; continue; }
          if (stockLive) {
            const st = Math.max(0, Number(x.stock) || 0);
            if (st <= 0) next[l.sku] = { type: "out", stock: 0 };
            else if (st < l.qty) next[l.sku] = { type: "short", stock: st };
          }
          const cur = Math.round(Number(x.price));
          if (stored[l.sku] && cur > 0 && stored[l.sku].price !== cur) { stored[l.sku].price = cur; priceChanged = true; }
        }
        if (priceChanged) saveBasket(store, stored);
        setIssues(next);
      } catch { /* keep last known state */ }
    };
    check();
    const t = setInterval(check, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [store, lines.map((l) => `${l.sku}:${l.qty}`).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  // gate off ⇒ the TBS basket is invisible everywhere (no rows, no totals, no
  // payload) — the server refuses gate-off TBS checkouts, so never surface one
  const effLines = enabled ? lines : [];
  const subtotal = effLines.reduce((n, l) => n + l.qty * l.price, 0);
  const storeName = TBS_FALLBACK_STORES.find((s) => s.code === store)?.name || store;
  const hasIssues = enabled && Object.keys(issues).length > 0;
  return { store, storeName, lines: effLines, subtotal, enabled, issues, hasIssues };
}

export default function TbsCartSection({ compact = false }: { compact?: boolean }) {
  const { store, storeName, lines, subtotal, enabled, issues, hasIssues } = useTbsBasket();
  if (!enabled || !store || lines.length === 0) return null;

  const setQty = (sku: string, qty: number) => {
    const items = loadBasket(store);
    const cap = issues[sku]?.type === "short" ? Math.max(1, issues[sku].stock) : issues[sku] ? 0 : 99;
    const n = Math.min(cap === 0 ? Math.min(qty, items[sku]?.qty ?? 0) : cap, qty);
    if (n <= 0) delete items[sku];
    else if (items[sku]) items[sku] = { ...items[sku], qty: n };
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
        {hasIssues ? (
          <div style={{ background: "#FBECEA", border: "1px solid #ECC9C5", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, color: "#8c1d18", fontWeight: 700, margin: "4px 0 8px" }}>
            ⚠️ Some items are no longer available in this quantity — please remove or reduce them to check out.
          </div>
        ) : null}
        {lines.map((l) => (
          <div key={l.sku} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid rgba(0,0,0,0.06)", fontSize: 13 }}>
            <div style={{ minWidth: 0, opacity: issues[l.sku]?.type === "out" || issues[l.sku]?.type === "gone" ? 0.55 : 1 }}>
              <Link href={`/tbs/p/${encodeURIComponent(l.sku.split("@")[0])}${l.sku.includes("@") ? `?u=${encodeURIComponent(l.sku.split("@")[1])}` : ""}`} style={{ textDecoration: "none", color: "#333", lineHeight: 1.35, display: "block" }}>{l.name}</Link>
              <div style={{ fontSize: 12, color: "#999" }}>{rp(l.price)} / {l.unit}</div>
              {issues[l.sku] ? (
                <div style={{ fontSize: 12, color: "#b3261e", fontWeight: 800, marginTop: 2 }}>
                  {issues[l.sku].type === "short" ? `Only ${issues[l.sku].stock} left — reduce the quantity` : "Out of stock — please remove"}
                </div>
              ) : null}
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
