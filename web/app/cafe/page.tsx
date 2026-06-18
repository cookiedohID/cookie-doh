"use client";

// web/app/cafe/page.tsx — in-store self-checkout / register POS
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { FLAVORS } from "@/lib/catalog";
import { SMOOTHIES, SMOOTHIE_PRICE } from "@/lib/smoothies";
import { COLORS } from "@/lib/theme";

const COOKIE_PRICE = 32500;
const formatIDR = (n: number) => `Rp ${Number(n).toLocaleString("id-ID")}`;

type Kind = "cookie" | "drink";
type MenuItem = { id: string; name: string; image?: string; price: number; kind: Kind; ingredients?: string[] };
type Line = { item: MenuItem; qty: number; free?: boolean };

// Printer calibration: open /cafe?calibrate=1 to jump straight to the print phase
// with a representative order (2 paid cookies + 1 free cookie + 1 drink) so the
// Clabel thermal printer can be tuned without taking a real payment.
const CALIBRATION_SNAPSHOT: { orderNo: string; lines: Line[]; total: number } = {
  orderNo: "CALIBRATION",
  total: COOKIE_PRICE * 2 + SMOOTHIE_PRICE,
  lines: [
    { item: { id: "the-one", name: "The One", price: COOKIE_PRICE, kind: "cookie" }, qty: 2 },
    { item: { id: "ruby-glow", name: "Ruby Glow", price: SMOOTHIE_PRICE, kind: "drink", ingredients: ["Plain yoghurt base", "Strawberry", "Dragon fruit", "Honey"] }, qty: 1 },
    { item: { id: "the-one", name: "The One", price: COOKIE_PRICE, kind: "cookie" }, qty: 1, free: true },
  ],
};

export default function CafePOS() {
  const [tab, setTab] = useState<Kind>("cookie");
  const [cart, setCart] = useState<Record<string, Line>>({});
  const [memberPhone, setMemberPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rewards, setRewards] = useState<{ name: string | null; freeCookies: number; freeDrinks: number } | null>(null);
  const [redeemKind, setRedeemKind] = useState<Kind | null>(null);

  // paid / print phase
  const [paid, setPaid] = useState<{ orderNo: string; lines: Line[]; total: number } | null>(null);
  const [printDoc, setPrintDoc] = useState<"receipt" | "stickers" | "recipe">("receipt");

  // Printer calibration mode (?calibrate=1) — seed a sample order, no payment.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("calibrate") === "1") {
      setPaid(CALIBRATION_SNAPSHOT);
    }
  }, []);

  const cookies: MenuItem[] = useMemo(
    () => FLAVORS.map((f: any) => ({ id: String(f.id), name: String(f.name), image: f.image, price: COOKIE_PRICE, kind: "cookie" as const })),
    []
  );
  const drinks: MenuItem[] = useMemo(
    () => SMOOTHIES.map((s) => ({ id: s.id, name: s.name, image: s.image, price: SMOOTHIE_PRICE, kind: "drink" as const, ingredients: s.ingredients })),
    []
  );
  const menu = tab === "cookie" ? cookies : drinks;

  const lines = Object.entries(cart).map(([key, l]) => ({ key, ...l }));
  const total = lines.reduce((s, l) => s + (l.free ? 0 : l.item.price * l.qty), 0);
  const paidCount = lines.reduce((s, l) => s + (l.free ? 0 : l.qty), 0);

  const usedFree = (kind: Kind) => lines.filter((l) => l.free && l.item.kind === kind).reduce((s, l) => s + l.qty, 0);
  const remainingFree = (kind: Kind) =>
    Math.max(0, (kind === "cookie" ? rewards?.freeCookies || 0 : rewards?.freeDrinks || 0) - usedFree(kind));

  function add(item: MenuItem) {
    // Keys include the kind: two SKUs (ruby-glow, strawberry-kiss) exist as BOTH
    // a cookie and a smoothie, so keying by id alone would collapse them into one
    // cart line (silent lost sale / mischarge).
    // Redeem mode: the next tapped item of the chosen kind becomes free.
    if (redeemKind === item.kind && remainingFree(item.kind) > 0) {
      const key = `free:${item.kind}:${item.id}`;
      setCart((c) => ({ ...c, [key]: { item, qty: (c[key]?.qty || 0) + 1, free: true } }));
      setRedeemKind(null);
      return;
    }
    const key = `${item.kind}:${item.id}`;
    setCart((c) => ({ ...c, [key]: { item, qty: (c[key]?.qty || 0) + 1 } }));
  }
  function bump(key: string, d: number) {
    setCart((c) => {
      const cur = c[key];
      if (!cur) return c;
      const qty = cur.qty + d;
      const next = { ...c };
      if (qty <= 0) delete next[key];
      else next[key] = { ...cur, qty };
      return next;
    });
  }

  async function checkRewards() {
    if (!memberPhone) return;
    const r = await fetch("/api/loyalty/lookup", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: memberPhone }),
    }).then((x) => x.json()).catch(() => null);
    setRewards(r?.ok ? { name: r.name, freeCookies: r.freeCookies, freeDrinks: r.freeDrinks } : { name: null, freeCookies: 0, freeDrinks: 0 });
  }

  function reset() { setCart({}); setMemberPhone(""); setRewards(null); setRedeemKind(null); }

  async function charge() {
    if (!paidCount) return;
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/cafe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((l) => ({ id: l.item.id, name: l.item.name, kind: l.item.kind, price: l.free ? 0 : l.item.price, quantity: l.qty, free: !!l.free })),
          memberPhone: memberPhone || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) { setErr(j?.error || "Checkout failed"); return; }

      const snapshot = { orderNo: String(j.order_no || j.order_id), lines: [...lines], total };
      if (window.snap?.pay) {
        window.snap.pay(j.snap_token, {
          onSuccess: () => { setPaid(snapshot); reset(); },
          onPending: () => { setPaid(snapshot); reset(); },
          onError: () => setErr("Payment failed — try again."),
          onClose: () => setErr("Payment cancelled."),
        });
      } else {
        setErr("Payment widget not loaded. Refresh and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  function printNow(doc: "receipt" | "stickers" | "recipe") {
    setPrintDoc(doc);
    setTimeout(() => window.print(), 60);
  }

  // ---------------- PAID / PRINT PHASE ----------------
  if (paid) {
    const drinkLines = paid.lines.filter((l) => l.item.kind === "drink");
    return (
      <main style={{ minHeight: "100vh", background: COLORS.bg }}>
        <PrintStyles />
        <div className="cafe-screen" style={{ maxWidth: 520, margin: "0 auto", padding: "40px 16px", textAlign: "center" }}>
          {paid.orderNo === "CALIBRATION" ? (
            <div style={{ background: "#fff4cc", border: "1px solid #e6c200", borderRadius: 12, padding: "8px 12px", fontWeight: 800, fontSize: 13, color: "#7a5c00", marginBottom: 10 }}>
              🖨️ Printer calibration — no payment taken
            </div>
          ) : null}
          <div style={{ fontSize: 40 }}>{paid.orderNo === "CALIBRATION" ? "🖨️" : "✅"}</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: COLORS.black, margin: "8px 0 2px" }}>{paid.orderNo === "CALIBRATION" ? "Test print" : "Payment received"}</h1>
          <p style={{ color: COLORS.muted }}>Order {paid.orderNo} · {formatIDR(paid.total)}</p>

          <div style={{ marginTop: 24, display: "grid", gap: 10 }}>
            <button onClick={() => printNow("receipt")} style={btn(COLORS.blue)}>🧾 Print customer receipt</button>
            <button onClick={() => printNow("stickers")} style={btn(COLORS.blue)}>🏷️ Print item stickers ({paid.lines.reduce((s, l) => s + l.qty, 0)})</button>
            {drinkLines.length ? (
              <button onClick={() => printNow("recipe")} style={btn(COLORS.blue)}>📋 Print drink recipes ({drinkLines.length})</button>
            ) : null}
            <button onClick={() => setPaid(null)} style={btn("#127a3e")}>＋ New order</button>
          </div>
        </div>

        {/* Print area — only the active doc prints */}
        <div id="print-area" data-doc={printDoc}>
          {printDoc === "receipt" ? <Receipt orderNo={paid.orderNo} lines={paid.lines} total={paid.total} /> : null}
          {printDoc === "stickers" ? <Stickers orderNo={paid.orderNo} lines={paid.lines} /> : null}
          {printDoc === "recipe" ? <Recipes orderNo={paid.orderNo} lines={drinkLines} /> : null}
        </div>
      </main>
    );
  }

  // ---------------- SHOP PHASE ----------------
  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg, paddingBottom: 150 }}>
      <PrintStyles />
      <div className="cafe-screen" style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 16px 0" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: COLORS.black, margin: 0 }}>Cafe · Order</h1>

        <div style={{ display: "flex", gap: 8, margin: "14px 0 16px" }}>
          {(["cookie", "drink"] as Kind[]).map((k) => (
            <button key={k} onClick={() => setTab(k)} style={{
              border: tab === k ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.14)",
              background: tab === k ? "rgba(0,20,167,0.06)" : "#fff",
              borderRadius: 999, padding: "10px 20px", fontWeight: 800, fontSize: 15, cursor: "pointer", color: COLORS.black,
            }}>{k === "cookie" ? "Cookies" : "Drinks"}</button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          {menu.map((it) => {
            const q = cart[`${tab}:${it.id}`]?.qty || 0;
            return (
              <button key={it.id} onClick={() => add(it)} style={{
                textAlign: "left", border: q > 0 ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.10)",
                borderRadius: 16, overflow: "hidden", background: "#fff", cursor: "pointer", padding: 0, position: "relative",
              }}>
                <div style={{ position: "relative", width: "100%", aspectRatio: "1/1", background: COLORS.sand }}>
                  {it.image ? <Image src={it.image} alt={it.name} fill style={{ objectFit: "cover" }} sizes="150px" /> : null}
                  {q > 0 ? <span style={{ position: "absolute", top: 8, right: 8, background: COLORS.blue, color: "#fff", borderRadius: 999, minWidth: 26, height: 26, display: "grid", placeItems: "center", fontWeight: 900, fontSize: 13 }}>{q}</span> : null}
                </div>
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: COLORS.black, lineHeight: 1.2, minHeight: 34 }}>{it.name}</div>
                  <div style={{ marginTop: 4, fontWeight: 800, color: COLORS.blue, fontSize: 13 }}>{formatIDR(it.price)}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cart bar */}
      <div className="cafe-screen" style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", borderTop: "1px solid rgba(0,0,0,0.10)", padding: "12px 16px", boxShadow: "0 -8px 24px rgba(0,0,0,0.06)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          {redeemKind ? (
            <div style={{ marginBottom: 8, fontWeight: 800, fontSize: 13, color: "#127a3e" }}>
              🎁 Tap the {redeemKind} above to add it free
            </div>
          ) : null}

          {lines.length ? (
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
              {lines.map((l) => (
                <div key={l.key} style={{ flex: "0 0 auto", border: l.free ? `1px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.12)", background: l.free ? "rgba(0,20,167,0.06)" : "#fff", borderRadius: 999, padding: "4px 6px 4px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{l.free ? "🎁 " : ""}{l.item.name}{l.free ? " · FREE" : ""}</span>
                  <button onClick={() => bump(l.key, -1)} style={miniBtn}>–</button>
                  <span style={{ fontWeight: 800, fontSize: 13, minWidth: 14, textAlign: "center" }}>{l.qty}</span>
                  <button onClick={() => bump(l.key, 1)} style={miniBtn}>+</button>
                </div>
              ))}
            </div>
          ) : null}

          {rewards && (rewards.freeCookies > 0 || rewards.freeDrinks > 0) ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: "#127a3e" }}>
                🎁 {rewards.name ? rewards.name + " · " : ""}{rewards.freeCookies} free cookie · {rewards.freeDrinks} free drink
              </span>
              {remainingFree("cookie") > 0 ? <button onClick={() => setRedeemKind(redeemKind === "cookie" ? null : "cookie")} style={rewardBtn(redeemKind === "cookie")}>Use free cookie</button> : null}
              {remainingFree("drink") > 0 ? <button onClick={() => setRedeemKind(redeemKind === "drink" ? null : "drink")} style={rewardBtn(redeemKind === "drink")}>Use free drink</button> : null}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: lines.length ? 4 : 0 }}>
            <input value={memberPhone} onChange={(e) => { setMemberPhone(e.target.value.replace(/[^\d+]/g, "")); setRewards(null); setRedeemKind(null); }}
              placeholder="Member phone (optional)" inputMode="tel"
              style={{ flex: 1, minWidth: 0, padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.16)", fontSize: 14 }} />
            {memberPhone && !rewards ? (
              <button onClick={checkRewards} style={{ flex: "0 0 auto", borderRadius: 12, height: 50, padding: "0 16px", border: `1px solid ${COLORS.blue}`, background: "#fff", color: COLORS.blue, fontWeight: 800, cursor: "pointer" }}>Rewards</button>
            ) : null}
            <button onClick={charge} disabled={!paidCount || busy} style={{
              flex: "0 0 auto", borderRadius: 999, height: 50, padding: "0 22px", border: "none",
              background: paidCount ? COLORS.blue : "rgba(0,20,167,0.4)", color: "#fff", fontWeight: 900, fontSize: 15, cursor: paidCount && !busy ? "pointer" : "not-allowed",
            }}>{busy ? "…" : `Charge QRIS · ${formatIDR(total)}`}</button>
          </div>
          {err ? <div style={{ color: "crimson", fontWeight: 700, fontSize: 13, marginTop: 6 }}>{err}</div> : null}
        </div>
      </div>
    </main>
  );
}

const btn = (bg: string): React.CSSProperties => ({ height: 52, borderRadius: 14, border: "none", background: bg, color: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer" });
const miniBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", background: "#fff", fontWeight: 900, cursor: "pointer" };
const rewardBtn = (active: boolean): React.CSSProperties => ({ borderRadius: 999, padding: "6px 12px", border: `1px solid #127a3e`, background: active ? "#127a3e" : "#fff", color: active ? "#fff" : "#127a3e", fontWeight: 800, fontSize: 12.5, cursor: "pointer" });

// ---------------- Print docs (thermal, 80mm) ----------------
function PrintStyles() {
  return (
    <style>{`
      @media print {
        @page { size: 80mm auto; margin: 4mm; }
        body { background: #fff; }
        .cafe-screen { display: none !important; }
        #print-area { display: block !important; }
      }
      #print-area { display: none; }
      .doc { width: 72mm; font-family: -apple-system, system-ui, monospace; color: #000; }
      .sticker { width: 72mm; border-bottom: 1px dashed #999; padding: 6px 0 10px; page-break-inside: avoid; }
      .recipe { page-break-after: always; padding-bottom: 10px; }
    `}</style>
  );
}

function Receipt({ orderNo, lines, total }: { orderNo: string; lines: Line[]; total: number }) {
  return (
    <div className="doc" style={{ textAlign: "center" }}>
      <div style={{ fontWeight: 800, fontSize: 16 }}>COOKIE DOH</div>
      <div style={{ fontSize: 11 }}>where the cookie magic happens</div>
      <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
      <div style={{ textAlign: "left", fontSize: 12 }}>Order: {orderNo}</div>
      <div style={{ textAlign: "left", fontSize: 12, marginBottom: 8 }}>{new Date().toLocaleString("id-ID")}</div>
      {lines.map((l, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, textAlign: "left" }}>
          <span>{l.free ? "🎁 " : ""}{l.qty}× {l.item.name}</span>
          <span>{l.free ? "FREE" : formatIDR(l.item.price * l.qty)}</span>
        </div>
      ))}
      <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 14 }}>
        <span>TOTAL</span><span>{formatIDR(total)}</span>
      </div>
      <div style={{ marginTop: 10, fontSize: 11 }}>Thank you 🤍</div>
    </div>
  );
}

function Stickers({ orderNo, lines }: { orderNo: string; lines: Line[] }) {
  // one sticker per unit
  const units: string[] = [];
  lines.forEach((l) => { for (let i = 0; i < l.qty; i++) units.push(l.item.name); });
  return (
    <div className="doc">
      {units.map((name, i) => (
        <div className="sticker" key={i}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{name}</div>
          <div style={{ fontSize: 10 }}>Order {orderNo} · Cookie Doh</div>
        </div>
      ))}
    </div>
  );
}

function Recipes({ orderNo, lines }: { orderNo: string; lines: Line[] }) {
  // per variety, with qty (batch)
  return (
    <div className="doc">
      {lines.map((l, i) => (
        <div className="recipe" key={i}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{l.item.name} ×{l.qty}</div>
          <div style={{ fontSize: 11, marginBottom: 6 }}>Order {orderNo} · make {l.qty}</div>
          <div style={{ borderTop: "1px dashed #000", marginBottom: 6 }} />
          {(l.item.ingredients || []).map((ing, i) => (
            <div key={i} style={{ fontSize: 13 }}>• {ing}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
