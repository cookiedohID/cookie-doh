"use client";

// web/app/tbs/checkout/page.tsx — TotalBuahStore checkout.
// Pickup or delivery from the chosen store; pays via the existing Midtrans
// snap popup. ALL money math is server-side (/api/tbs/checkout repricing +
// delivery fee) — this page only displays what the server returns.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GoogleAddressInput from "@/components/GoogleAddressInput";
import { useTbsBasket } from "@/components/TbsCartSection";
import { tbsIssueText, tbsIssueDead } from "@/lib/tbsStockCheck";
import {
  RED, GREEN, CREAM, rp, saveBasket, useTbsGate, ComingSoon,
} from "../shared";

export default function TbsCheckoutPage() {
  const { gate } = useTbsGate();
  const router = useRouter();
  // shared basket hook: same lines the cart shows + live stock validation
  // (auto-refreshes vs the store; hasIssues gates the pay button below)
  const { store, storeName, lines, subtotal, issues, hasIssues } = useTbsBasket();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [fulfil, setFulfil] = useState<"pickup" | "delivery">("pickup");
  const [address, setAddress] = useState("");
  const [latLng, setLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [serverPricing, setServerPricing] = useState<{ subtotal: number; delivery_fee: number; km: number | null; total: number } | null>(null);

  useEffect(() => {
    // prefill member contact if they've ordered before
    try {
      const saved = JSON.parse(localStorage.getItem("cd_contact") || "null");
      if (saved?.name) setName(saved.name);
      if (saved?.phone) setPhone(saved.phone);
    } catch { /* ignore */ }
  }, []);

  const pay = async () => {
    setErr(""); setBusy(true); setServerPricing(null);
    try {
      const r = await fetch("/api/tbs/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store, fulfil, notes,
          customer: { name, phone },
          address: fulfil === "delivery" ? address : undefined,
          lat: latLng?.lat, lng: latLng?.lng,
          lines: lines.map((l) => ({ sku: l.sku, qty: l.qty })),
        }),
      });
      const j = await r.json();
      if (!j?.ok || !j.snap_token) { setErr(j?.error || "Checkout failed — please try again."); setBusy(false); return; }
      setServerPricing(j.pricing);
      try { localStorage.setItem("cd_contact", JSON.stringify({ name, phone })); } catch { /* ignore */ }
      if (!(window as any).snap?.pay) { setErr("Payment window couldn't load — refresh and try again."); setBusy(false); return; }
      (window as any).snap.pay(j.snap_token, {
        onSuccess: () => { saveBasket(store, {}); router.push("/tbs/success"); },
        onPending: () => { setErr("Payment is pending — finish it in your bank/e-wallet app. We'll WhatsApp you once it's received (your basket is kept until then)."); setBusy(false); },
        onError: () => { setErr("Payment didn't go through — nothing was charged. Try again."); setBusy(false); },
        onClose: () => { setBusy(false); },
      });
    } catch {
      setErr("Something went wrong — please try again."); setBusy(false);
    }
  };

  if (gate === "loading") return <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "#888" }}>Loading…</main>;
  if (gate === "hidden") return <ComingSoon />;

  const canPay = lines.length > 0 && !hasIssues && name.trim() && phone.trim().length >= 9 && (fulfil === "pickup" || (address && latLng));

  return (
    <main style={{ minHeight: "100vh", background: CREAM }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "18px 14px 90px" }}>
        <nav style={{ fontSize: 12.5, color: "#999", marginBottom: 10 }}>
          <Link href="/tbs" style={{ color: "#999", textDecoration: "none" }}>Shop</Link> · <b style={{ color: GREEN }}>Checkout</b>
        </nav>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#191919" }}>Checkout — <span style={{ color: GREEN }}>{storeName}</span></h1>

        {lines.length === 0 ? (
          <p style={{ marginTop: 16, color: "#777" }}>Your basket is empty. <Link href="/tbs" style={{ color: RED, fontWeight: 800 }}>Back to the shop</Link></p>
        ) : (
          <>
            {/* order summary */}
            <section style={{ marginTop: 14, background: "#fff", borderRadius: 14, border: "1px solid rgba(0,0,0,0.07)", padding: "6px 14px" }}>
              {hasIssues ? (
                <div style={{ background: "#FBECEA", border: "1px solid #ECC9C5", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, color: "#8c1d18", fontWeight: 700, margin: "8px 0" }}>
                  ⚠️ Some items are no longer available — <Link href="/tbs" style={{ color: "#8c1d18" }}>go back</Link> and remove or reduce them to pay.
                </div>
              ) : null}
              {lines.map((l) => (
                <div key={l.sku} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: "1px solid rgba(0,0,0,0.05)", fontSize: 13, opacity: tbsIssueDead(issues[l.sku]) ? 0.55 : 1 }}>
                  <span style={{ color: "#333" }}>
                    <Link href={`/tbs/p/${encodeURIComponent(l.sku.split("@")[0])}${l.sku.includes("@") ? `?u=${encodeURIComponent(l.sku.split("@")[1])}` : ""}`}
                      style={{ color: "#333", textDecoration: "none" }}>{l.name}</Link> <span style={{ color: "#999" }}>× {l.qty}</span>
                    {issues[l.sku] ? (
                      <span style={{ display: "block", color: "#b3261e", fontWeight: 800, fontSize: 12 }}>{tbsIssueText(issues[l.sku])}</span>
                    ) : null}
                  </span>
                  <span style={{ fontWeight: 700 }}>{rp(l.qty * l.price)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontSize: 14, fontWeight: 900 }}>
                <span>Subtotal</span><span>{rp(subtotal)}</span>
              </div>
            </section>

            {/* contact */}
            <section style={{ marginTop: 14, display: "grid", gap: 9 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"
                style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.15)", fontSize: 15, background: "#fff" }} />
              <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))} placeholder="WhatsApp number (08…)" inputMode="tel"
                style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.15)", fontSize: 15, background: "#fff" }} />
            </section>

            {/* fulfilment */}
            <section style={{ marginTop: 14 }}>
              <div style={{ display: "flex", gap: 8 }}>
                {(["pickup", "delivery"] as const).map((f) => (
                  <button key={f} onClick={() => setFulfil(f)}
                    style={{ flex: 1, border: fulfil === f ? `2px solid ${GREEN}` : "1px solid rgba(0,0,0,0.14)", background: fulfil === f ? "#F0F7EE" : "#fff", color: "#222", borderRadius: 12, padding: "12px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                    {f === "pickup" ? "🏬 Pickup at store" : "🛵 Deliver to me"}
                  </button>
                ))}
              </div>
              {fulfil === "pickup" ? (
                <p style={{ fontSize: 12.5, color: "#777", marginTop: 8 }}>Collect at <b>{storeName}</b> — we&apos;ll WhatsApp you when it&apos;s ready.</p>
              ) : (
                <div style={{ marginTop: 10 }}>
                  <GoogleAddressInput
                    apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}
                    value={address}
                    onChange={(v: string) => { setAddress(v); setLatLng(null); }}
                    onResolved={(d: any) => { setAddress(d?.address || d?.formatted || address); if (Number.isFinite(d?.lat) && Number.isFinite(d?.lng)) setLatLng({ lat: d.lat, lng: d.lng }); }}
                    placeholder="Delivery address (pick from suggestions)"
                  />
                  <p style={{ fontSize: 12, color: "#999", marginTop: 6 }}>Delivery fee is by distance from {storeName} (max 12 km) — shown before you pay.</p>
                </div>
              )}
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for the store (optional)" rows={2}
                style={{ width: "100%", marginTop: 10, padding: "11px 13px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.14)", fontSize: 14, background: "#fff", resize: "vertical" }} />
            </section>

            {serverPricing ? (
              <section style={{ marginTop: 12, background: "#F0F7EE", border: `1px solid ${GREEN}33`, borderRadius: 12, padding: "10px 14px", fontSize: 13.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Items</span><b>{rp(serverPricing.subtotal)}</b></div>
                {serverPricing.delivery_fee ? <div style={{ display: "flex", justifyContent: "space-between" }}><span>Delivery{serverPricing.km ? ` (${serverPricing.km} km)` : ""}</span><b>{rp(serverPricing.delivery_fee)}</b></div> : null}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, marginTop: 4 }}><span>Total</span><span style={{ color: RED }}>{rp(serverPricing.total)}</span></div>
              </section>
            ) : null}

            {err ? <p style={{ color: "#b32", fontWeight: 700, fontSize: 13.5, marginTop: 12 }}>{err}</p> : null}

            <button onClick={pay} disabled={!canPay || busy}
              style={{ width: "100%", marginTop: 14, border: "none", borderRadius: 12, padding: "15px", fontWeight: 900, fontSize: 15.5, cursor: canPay && !busy ? "pointer" : "default", background: canPay && !busy ? "#7CB342" : "#ddd", color: canPay && !busy ? "#fff" : "#999" }}>
              {busy ? "Opening payment…" : `Pay ${fulfil === "delivery" ? "(items + delivery)" : rp(subtotal)}`}
            </button>
            <p style={{ fontSize: 11.5, color: "#999", textAlign: "center", marginTop: 8 }}>
              Prices are confirmed by the store at payment time. QRIS / cards via Midtrans.
            </p>
            <p style={{ fontSize: 11.5, color: "#7a5c00", textAlign: "center", marginTop: 4, fontWeight: 700 }}>
              🛡 Arrival promise: ready within 3 store hours (10:00–21:00) — or we send you a Rp10.000 voucher.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
