"use client";

// web/app/cafe/page.tsx — in-store self-checkout / register POS (kiosk)
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { FLAVORS } from "@/lib/catalog";
import { SMOOTHIES, SMOOTHIE_PRICE } from "@/lib/smoothies";
import { COLORS } from "@/lib/theme";

const COOKIE_PRICE = 32500;
const formatIDR = (n: number) => `Rp ${Number(n).toLocaleString("id-ID")}`;

// ⚠️ Conservative defaults — CONFIRM/REPLACE with real kitchen allergen data.
// Over-warning is safe; under-warning is dangerous. Edit per item if needed.
const COOKIE_ALLERGENS = "Contains: gluten (wheat), milk, egg. May contain: tree nuts, peanuts, soy.";
const DRINK_ALLERGENS = "Contains: milk. May contain: tree nuts, peanuts.";

type Kind = "cookie" | "drink";
type MenuItem = {
  id: string; name: string; image?: string; price: number; kind: Kind;
  description?: string; ingredients?: string[]; allergens?: string;
};
type Line = { item: MenuItem; qty: number; free?: boolean };

export default function CafePOS() {
  const [cart, setCart] = useState<Record<string, Line>>({});
  const [memberPhone, setMemberPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rewards, setRewards] = useState<{ name: string | null; freeCookies: number; freeDrinks: number } | null>(null);
  const [redeemKind, setRedeemKind] = useState<Kind | null>(null);
  const [detail, setDetail] = useState<MenuItem | null>(null);

  // paid / print phase
  const [paid, setPaid] = useState<{ orderNo: string; lines: Line[]; total: number } | null>(null);
  const [calibrate, setCalibrate] = useState(false);
  const [printDoc, setPrintDoc] = useState<"receipt" | "stickers" | "recipe">("receipt");

  const cookies: MenuItem[] = useMemo(
    () => FLAVORS.map((f: any) => ({
      id: String(f.id), name: String(f.name), image: f.image, price: COOKIE_PRICE, kind: "cookie" as const,
      description: f.description, ingredients: f.ingredients, allergens: COOKIE_ALLERGENS,
    })),
    []
  );
  const drinks: MenuItem[] = useMemo(
    () => SMOOTHIES.map((s) => ({
      id: s.id, name: s.name, image: s.image, price: SMOOTHIE_PRICE, kind: "drink" as const,
      description: s.description, ingredients: s.ingredients, allergens: DRINK_ALLERGENS,
    })),
    []
  );
  const sections = useMemo(
    () => [
      { id: "cookies", label: "🍪 Cookies", items: cookies },
      { id: "drinks", label: "🥤 Drinks", items: drinks },
    ],
    [cookies, drinks]
  );

  const lines = Object.entries(cart).map(([key, l]) => ({ key, ...l }));
  const total = lines.reduce((s, l) => s + (l.free ? 0 : l.item.price * l.qty), 0);
  const paidCount = lines.reduce((s, l) => s + (l.free ? 0 : l.qty), 0);

  const usedFree = (kind: Kind) => lines.filter((l) => l.free && l.item.kind === kind).reduce((s, l) => s + l.qty, 0);
  const remainingFree = (kind: Kind) =>
    Math.max(0, (kind === "cookie" ? rewards?.freeCookies || 0 : rewards?.freeDrinks || 0) - usedFree(kind));

  // Printer calibration / print preview: ?calibrate=1 shows the 3 docs (no payment).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("calibrate") === "1") {
      setCalibrate(true);
      setPaid({
        orderNo: "PREVIEW",
        total: COOKIE_PRICE * 2 + SMOOTHIE_PRICE,
        lines: [
          { item: { id: "the-one", name: "The One", price: COOKIE_PRICE, kind: "cookie" }, qty: 2 },
          { item: { id: "ruby-glow", name: "Ruby Glow", price: SMOOTHIE_PRICE, kind: "drink", ingredients: ["Plain yoghurt base", "Strawberry", "Dragon fruit", "Honey"] }, qty: 1 },
          { item: { id: "the-one", name: "The One", price: COOKIE_PRICE, kind: "cookie" }, qty: 1, free: true },
        ],
      });
    }
  }, []);

  // After a real payment, return to the menu for the next customer.
  useEffect(() => {
    if (paid && !calibrate) {
      const t = setTimeout(() => setPaid(null), 12000);
      return () => clearTimeout(t);
    }
  }, [paid, calibrate]);

  function add(item: MenuItem) {
    // Keys include the kind: two SKUs (ruby-glow, strawberry-kiss) exist as BOTH
    // a cookie and a smoothie, so keying by id alone would collapse them.
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

  function jump(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
      const snap = (window as any).snap;
      if (snap?.pay) {
        snap.pay(j.snap_token, {
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

  // ---------------- PRINT PREVIEW (calibration only) ----------------
  if (paid && calibrate) {
    const drinkLines = paid.lines.filter((l) => l.item.kind === "drink");
    return (
      <main style={{ minHeight: "100vh", background: COLORS.bg }}>
        <PrintStyles />
        <div className="cafe-screen" style={{ maxWidth: 520, margin: "0 auto", padding: "32px 16px", textAlign: "center" }}>
          <div style={{ background: "#fff4cc", border: "1px solid #e6c200", borderRadius: 12, padding: "10px 12px", fontWeight: 800, fontSize: 13, color: "#7a5c00", marginBottom: 14 }}>
            🖨️ PRINT PREVIEW — test only, no payment. (In production the print agent sends these to the 3 printers automatically.)
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
            {(["receipt", "stickers", "recipe"] as const).map((d) => (
              <button key={d} onClick={() => setPrintDoc(d)} style={{
                borderRadius: 999, padding: "8px 16px", fontWeight: 800, cursor: "pointer",
                border: printDoc === d ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.15)",
                background: printDoc === d ? "rgba(0,20,167,0.06)" : "#fff", color: COLORS.black,
              }}>{d === "receipt" ? "Receipt" : d === "stickers" ? "Stickers" : "Recipe"}</button>
            ))}
            <button onClick={() => window.print()} style={btn(COLORS.blue)}>Print / Save PDF</button>
          </div>
          <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 16, display: "inline-block", background: "#fff" }}>
            {printDoc === "receipt" ? <Receipt orderNo={paid.orderNo} lines={paid.lines} total={paid.total} /> : null}
            {printDoc === "stickers" ? <Stickers orderNo={paid.orderNo} lines={paid.lines} /> : null}
            {printDoc === "recipe" ? <Recipes orderNo={paid.orderNo} lines={drinkLines} /> : null}
          </div>
        </div>
        <div id="print-area" data-doc={printDoc}>
          {printDoc === "receipt" ? <Receipt orderNo={paid.orderNo} lines={paid.lines} total={paid.total} /> : null}
          {printDoc === "stickers" ? <Stickers orderNo={paid.orderNo} lines={paid.lines} /> : null}
          {printDoc === "recipe" ? <Recipes orderNo={paid.orderNo} lines={drinkLines} /> : null}
        </div>
      </main>
    );
  }

  // ---------------- PAYMENT RECEIVED (real) ----------------
  if (paid) {
    return (
      <main style={{ minHeight: "100vh", background: COLORS.bg, display: "grid", placeItems: "center" }}>
        <div style={{ maxWidth: 460, padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 56 }}>✅</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: COLORS.black, margin: "10px 0 4px" }}>Payment received</h1>
          <p style={{ color: COLORS.muted, fontSize: 15 }}>Order {paid.orderNo} · {formatIDR(paid.total)}</p>
          <p style={{ marginTop: 18, fontSize: 16, fontWeight: 700, color: COLORS.blue }}>🖨️ Printing your receipt, stickers &amp; recipe…</p>
          <p style={{ color: COLORS.muted, fontSize: 13, marginTop: 6 }}>Please collect them at the counter.</p>
          <button onClick={() => setPaid(null)} style={{ ...btn("#127a3e"), marginTop: 28, width: 220 }}>＋ New order</button>
        </div>
      </main>
    );
  }

  // ---------------- SHOP (kiosk) ----------------
  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg, paddingBottom: 160 }}>
      {/* Kiosk header + jump nav */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(255,255,255,0.96)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "14px 16px 10px" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.black, margin: 0 }}>Order here 🍪</h1>
          <div style={{ display: "flex", gap: 8, marginTop: 10, overflowX: "auto" }}>
            {sections.map((s) => (
              <button key={s.id} onClick={() => jump(s.id)} style={{
                flex: "0 0 auto", border: "1px solid rgba(0,0,0,0.14)", background: "#fff", borderRadius: 999,
                padding: "8px 18px", fontWeight: 800, fontSize: 14, cursor: "pointer", color: COLORS.black,
              }}>{s.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "8px 16px 0" }}>
        {sections.map((s) => (
          <section key={s.id} id={s.id} style={{ scrollMarginTop: 96, paddingTop: 18 }}>
            <h2 style={{ fontSize: 19, fontWeight: 800, color: COLORS.black, margin: "0 0 12px" }}>{s.label}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {s.items.map((it) => {
                const key = `${it.kind}:${it.id}`;
                const q = cart[key]?.qty || 0;
                return (
                  <div key={`${it.kind}:${it.id}`} onClick={() => setDetail(it)} role="button" aria-label={`${it.name} — details`} style={{
                    textAlign: "left", border: q > 0 ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.10)",
                    borderRadius: 16, overflow: "hidden", background: "#fff", cursor: "pointer", position: "relative",
                  }}>
                    <div style={{ position: "relative", width: "100%", aspectRatio: "1/1", background: COLORS.sand }}>
                      {it.image ? <Image src={it.image} alt={it.name} fill style={{ objectFit: "cover" }} sizes="(max-width:700px) 50vw, 260px" /> : null}
                      {q > 0 ? <span style={{ position: "absolute", top: 8, right: 8, background: COLORS.blue, color: "#fff", borderRadius: 999, minWidth: 26, height: 26, display: "grid", placeItems: "center", fontWeight: 900, fontSize: 13 }}>{q}</span> : null}
                    </div>
                    <div style={{ padding: "10px 12px" }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: COLORS.black, lineHeight: 1.2, minHeight: 34 }}>{it.name}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                        <span style={{ fontWeight: 800, color: COLORS.blue, fontSize: 13 }}>{formatIDR(it.price)}</span>
                        {q > 0 ? (
                          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button onClick={(e) => { e.stopPropagation(); bump(key, -1); }} aria-label={`Remove one ${it.name}`} style={stepBtn}>–</button>
                            <span style={{ fontWeight: 800, fontSize: 14, minWidth: 14, textAlign: "center" }}>{q}</span>
                            <button onClick={(e) => { e.stopPropagation(); bump(key, 1); }} aria-label={`Add one ${it.name}`} style={stepBtn}>+</button>
                          </div>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); add(it); }} aria-label={`Add ${it.name}`} style={{ border: "none", background: "#127a3e", color: "#fff", borderRadius: 999, padding: "7px 16px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>+ Add</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Detail modal — ingredients + allergens */}
      {detail ? (
        <div onClick={() => setDetail(null)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, maxWidth: 420, width: "100%", maxHeight: "86vh", overflow: "auto" }}>
            <div style={{ position: "relative", width: "100%", aspectRatio: "16/10", background: COLORS.sand }}>
              {detail.image ? <Image src={detail.image} alt={detail.name} fill style={{ objectFit: "cover" }} sizes="420px" /> : null}
              <button onClick={() => setDetail(null)} aria-label="Close" style={{ position: "absolute", top: 10, right: 10, width: 32, height: 32, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.95)", fontWeight: 900, cursor: "pointer", fontSize: 16 }}>×</button>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: COLORS.black }}>{detail.name}</h3>
                <span style={{ fontWeight: 800, color: COLORS.blue }}>{formatIDR(detail.price)}</span>
              </div>
              {detail.description ? <p style={{ color: COLORS.muted, fontSize: 14, marginTop: 8 }}>{detail.description}</p> : null}
              {detail.ingredients?.length ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: COLORS.black, marginBottom: 6 }}>Ingredients</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {detail.ingredients.map((ing) => (
                      <span key={ing} style={{ fontSize: 12, fontWeight: 700, color: COLORS.black, background: COLORS.sand, borderRadius: 999, padding: "4px 10px" }}>{ing}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {detail.allergens ? (
                <div style={{ marginTop: 12, background: "#fff4cc", border: "1px solid #e6c200", borderRadius: 12, padding: "10px 12px" }}>
                  <div style={{ fontWeight: 800, fontSize: 12.5, color: "#7a5c00" }}>⚠️ Allergens</div>
                  <div style={{ fontSize: 12.5, color: "#7a5c00", marginTop: 2 }}>{detail.allergens}</div>
                </div>
              ) : null}
              <button onClick={() => { add(detail); setDetail(null); }} style={{ ...btn(COLORS.blue), marginTop: 16, width: "100%" }}>＋ Add to order</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Cart bar */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40, background: "#fff", borderTop: "1px solid rgba(0,0,0,0.10)", padding: "12px 16px", boxShadow: "0 -8px 24px rgba(0,0,0,0.06)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {redeemKind ? (
            <div style={{ marginBottom: 8, fontWeight: 800, fontSize: 13, color: "#127a3e" }}>🎁 Tap the {redeemKind} above to add it free</div>
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
const stepBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 999, border: `1px solid ${COLORS.blue}`, background: "#fff", color: COLORS.blue, fontWeight: 900, fontSize: 17, lineHeight: 1, cursor: "pointer", display: "grid", placeItems: "center" };
const rewardBtn = (active: boolean): React.CSSProperties => ({ borderRadius: 999, padding: "6px 12px", border: `1px solid #127a3e`, background: active ? "#127a3e" : "#fff", color: active ? "#fff" : "#127a3e", fontWeight: 800, fontSize: 12.5, cursor: "pointer" });

// ---------------- Print docs (thermal, 80mm) — used by the calibration preview ----------------
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
  return (
    <div className="doc">
      {lines.map((l, i) => (
        <div className="recipe" key={i}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{l.item.name} ×{l.qty}</div>
          <div style={{ fontSize: 11, marginBottom: 6 }}>Order {orderNo} · make {l.qty}</div>
          <div style={{ borderTop: "1px dashed #000", marginBottom: 6 }} />
          {(l.item.ingredients || []).map((ing, j) => (
            <div key={j} style={{ fontSize: 13 }}>• {ing}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
