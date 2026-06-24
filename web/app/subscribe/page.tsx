"use client";

// web/app/subscribe/page.tsx — Subscribe wizard.
// Configure a prepaid cookie-box subscription (size → contents → frequency →
// plan length → delivery) and pay ONE QRIS for N boxes. Activation happens in the
// Midtrans webhook (CD-SUB- branch). All pricing/identity is server-authoritative;
// this page only collects choices and opens the Snap popup.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FLAVORS } from "@/lib/catalog";
import { COLORS, RADIUS } from "@/lib/theme";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import {
  SUB_PLAN_BOX_OPTIONS, SUB_BOX_SIZES, SUB_FREQUENCIES, FREQUENCY_LABEL,
  subBoxPrice, subPlanAmount, subFreeCookies, type SubFrequency, type SubMode, type SubFulfilment,
} from "@/lib/subscriptions";

type PickupPoint = { id: string; name: string; address: string };

function parsePickupPoints(raw: string | undefined): PickupPoint[] {
  try {
    const arr = JSON.parse(raw || "[]");
    if (!Array.isArray(arr)) return [];
    return arr
      .map((p: any) => ({ id: String(p.id || ""), name: String(p.name || ""), address: String(p.address || "") }))
      .filter((p) => p.id && p.name);
  } catch {
    return [];
  }
}

const rp = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

export default function SubscribePage() {
  const router = useRouter();
  const cookies = useMemo(() => FLAVORS.filter((f: any) => !f.soldOut), []);
  const pickupPoints = useMemo(() => parsePickupPoints(process.env.NEXT_PUBLIC_PICKUP_POINTS_JSON), []);

  // ---- selections ----
  const [boxSize, setBoxSize] = useState<3 | 6>(6);
  const [mode, setMode] = useState<SubMode>("fixed");
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [frequency, setFrequency] = useState<SubFrequency>("weekly");
  const [planBoxes, setPlanBoxes] = useState<number>(8);
  const [fulfilment, setFulfilment] = useState<SubFulfilment>("delivery");
  const [address, setAddress] = useState("");
  const [building, setBuilding] = useState("");
  const [postal, setPostal] = useState("");
  const [notes, setNotes] = useState("");
  const [pickupPointId, setPickupPointId] = useState<string>(pickupPoints[0]?.id || "");

  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [favourites, setFavourites] = useState<{ id: string; name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getSupabaseBrowser().auth.getSession().then(async ({ data }) => {
      const t = data.session?.access_token;
      setSignedIn(!!t);
      if (!t) return;
      // Pull the member's most-ordered cookies for the "use my favourites" quick-fill.
      try {
        const res = await fetch("/api/account/favourites", { headers: { Authorization: `Bearer ${t}` } });
        const j = await res.json();
        if (j?.ok && Array.isArray(j.favourites)) {
          setFavourites(j.favourites.filter((f: any) => cookies.some((c: any) => c.id === f.id)));
        }
      } catch {
        /* favourites are a nicety — ignore failures */
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Round-robin the member's top favourites until the box is full (top picks fill
  // first, so a box smaller than their list still uses the most-loved cookies).
  function useMyFavourites() {
    if (!favourites.length) return;
    const next: Record<string, number> = {};
    let total = 0, i = 0;
    while (total < boxSize && i < boxSize * favourites.length + boxSize) {
      const f = favourites[i % favourites.length];
      next[f.id] = (next[f.id] || 0) + 1;
      total++; i++;
    }
    setPicks(next);
  }

  const picksTotal = useMemo(() => Object.values(picks).reduce((s, n) => s + n, 0), [picks]);
  const fixedComplete = mode === "curated" || picksTotal === boxSize;

  function setPick(id: string, delta: number) {
    setPicks((prev) => {
      const cur = prev[id] || 0;
      const total = Object.values(prev).reduce((s, n) => s + n, 0);
      let next = cur + delta;
      if (next < 0) next = 0;
      if (delta > 0 && total >= boxSize) return prev; // box full
      const out = { ...prev, [id]: next };
      if (next === 0) delete out[id];
      return out;
    });
  }

  // If the box size shrinks below current picks, clear them so the count stays valid.
  useEffect(() => {
    if (picksTotal > boxSize) setPicks({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxSize]);

  const planTotal = subPlanAmount(boxSize, planBoxes);
  const perBox = subBoxPrice(boxSize);
  // Plain-language cadence so the summary can't be read as "N boxes per delivery".
  const freqAdverb = frequency === "weekly" ? "every week" : frequency === "biweekly" ? "every 2 weeks" : "every month";
  const spanWeeks = frequency === "weekly" ? planBoxes : planBoxes * 2;
  const durationText = frequency === "monthly" ? `${planBoxes} month${planBoxes > 1 ? "s" : ""}` : `${spanWeeks} weeks`;

  const valid =
    fixedComplete &&
    (fulfilment === "pickup" ? !!pickupPointId : address.trim().length > 5);

  async function subscribe() {
    setErr(null);
    if (!signedIn) {
      router.push("/account?next=/subscribe");
      return;
    }
    if (!fixedComplete) return setErr(`Pick exactly ${boxSize} cookies (you have ${picksTotal}).`);
    if (fulfilment === "delivery" && address.trim().length <= 5) return setErr("Add your delivery address.");
    if (typeof window === "undefined" || !(window as any).snap?.pay) {
      return setErr("Payment is still loading — refresh and try again.");
    }

    setLoading(true);
    try {
      const { data } = await getSupabaseBrowser().auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        router.push("/account?next=/subscribe");
        return;
      }

      const fixed_flavours =
        mode === "fixed"
          ? Object.entries(picks).map(([id, quantity]) => ({
              id,
              name: cookies.find((c: any) => c.id === id)?.name || "Cookie",
              quantity,
            }))
          : [];

      const body: any = {
        box_size: boxSize,
        boxes: planBoxes,
        frequency,
        mode,
        fixed_flavours,
        fulfilment,
        notes,
        delivery:
          fulfilment === "delivery"
            ? { address: address.trim(), buildingName: building.trim(), postal: postal.trim() }
            : null,
        pickup:
          fulfilment === "pickup"
            ? { pointName: pickupPoints.find((p) => p.id === pickupPointId)?.name || "" }
            : null,
      };

      const res = await fetch("/api/subscriptions/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Could not start subscription (HTTP ${res.status}).`);

      (window as any).snap.pay(String(json.snap_token), {
        onSuccess: () => router.push("/account/subscription?welcome=1"),
        onPending: () => router.push("/account/subscription?pending=1"),
        onError: (r: any) => setErr(r?.status_message || "Payment failed. Please try again."),
        onClose: () => setErr("Payment popup was closed before finishing."),
      });
    } catch (e: any) {
      setErr(e?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ background: COLORS.bg, minHeight: "100vh", paddingBottom: 120 }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 16px 40px" }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: COLORS.black, margin: "0 0 4px" }}>
          Cookie Doh Subscription
        </h1>
        <p style={{ color: COLORS.muted, margin: "0 0 8px", fontSize: 15 }}>
          Fresh cookies on repeat — prepay a plan, save the hassle, and get a{" "}
          <b style={{ color: COLORS.orange }}>free cookies — buy 6, get 1 free</b> 🍪
        </p>

        {signedIn === false && (
          <Banner tone="info">
            You’ll sign in at the last step to link this to your membership &amp; loyalty.
          </Banner>
        )}

        {/* 1 — Box size */}
        <Section n={1} title="Choose your box">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {SUB_BOX_SIZES.map((s) => (
              <Choice key={s} selected={boxSize === s} onClick={() => setBoxSize(s)}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Box of {s}</div>
                <div style={{ color: COLORS.muted, fontSize: 13 }}>{s} cookies per box</div>
                <div style={{ marginTop: 6, fontWeight: 700, color: COLORS.blue }}>{rp(subBoxPrice(s))}/box</div>
              </Choice>
            ))}
          </div>
        </Section>

        {/* 2 — Contents */}
        <Section n={2} title="What’s inside each box">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: mode === "fixed" ? 14 : 0 }}>
            <Choice selected={mode === "fixed"} onClick={() => setMode("fixed")}>
              <div style={{ fontWeight: 800 }}>My fixed favourites</div>
              <div style={{ color: COLORS.muted, fontSize: 13 }}>Same cookies you love, every time</div>
            </Choice>
            <Choice selected={mode === "curated"} onClick={() => setMode("curated")}>
              <div style={{ fontWeight: 800 }}>Curated surprise</div>
              <div style={{ color: COLORS.muted, fontSize: 13 }}>We pick a fresh mix each box</div>
            </Choice>
          </div>

          {mode === "fixed" && (
            <>
              {signedIn && favourites.length > 0 && (
                <div style={{ background: "#EAF0FF", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.blue }}>⚡ Your usuals</div>
                  <div style={{ fontSize: 13, color: COLORS.muted, margin: "2px 0 10px" }}>
                    Based on what you’ve ordered: {favourites.slice(0, 4).map((f) => f.name).join(", ")}
                    {favourites.length > 4 ? "…" : ""}
                  </div>
                  <button
                    onClick={useMyFavourites}
                    style={{ background: COLORS.blue, color: "#fff", border: "none", borderRadius: 999, padding: "9px 18px", fontWeight: 800, cursor: "pointer", fontSize: 14 }}
                  >
                    Fill my box with favourites
                  </button>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Pick your cookies</span>
                <span style={{ fontWeight: 800, color: picksTotal === boxSize ? COLORS.blue : COLORS.orange }}>
                  {picksTotal}/{boxSize}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                {cookies.map((c: any) => {
                  const qty = picks[c.id] || 0;
                  const full = picksTotal >= boxSize && qty === 0;
                  return (
                    <div
                      key={c.id}
                      style={{
                        border: `2px solid ${qty > 0 ? COLORS.blue : "#eee"}`,
                        borderRadius: 14,
                        background: "#fff",
                        overflow: "hidden",
                        opacity: full ? 0.55 : 1,
                      }}
                    >
                      <div style={{ position: "relative", width: "100%", aspectRatio: "1/1", background: "#f3f0ea" }}>
                        {c.image && (
                          <Image src={c.image} alt={c.name} fill sizes="150px" style={{ objectFit: "cover" }} />
                        )}
                        {qty > 0 && (
                          <span
                            style={{
                              position: "absolute", top: 6, right: 6, background: COLORS.blue, color: "#fff",
                              borderRadius: 999, minWidth: 22, height: 22, fontSize: 13, fontWeight: 800,
                              display: "grid", placeItems: "center", padding: "0 6px",
                            }}
                          >
                            {qty}
                          </span>
                        )}
                      </div>
                      <div style={{ padding: "8px 10px" }}>
                        <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.2, minHeight: 32 }}>{c.name}</div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                          <StepBtn label="−" onClick={() => setPick(c.id, -1)} disabled={qty === 0} />
                          <span style={{ fontWeight: 800, fontSize: 15 }}>{qty}</span>
                          <StepBtn label="+" onClick={() => setPick(c.id, +1)} disabled={picksTotal >= boxSize} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Section>

        {/* 3 — Frequency */}
        <Section n={3} title="How often">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {SUB_FREQUENCIES.map((f) => (
              <button
                key={f}
                onClick={() => setFrequency(f)}
                style={{
                  border: `2px solid ${frequency === f ? COLORS.blue : "#e3e0d9"}`,
                  background: frequency === f ? COLORS.blue : "#fff",
                  color: frequency === f ? "#fff" : COLORS.black,
                  borderRadius: 999, padding: "10px 18px", fontWeight: 700, cursor: "pointer",
                }}
              >
                {FREQUENCY_LABEL[f]}
              </button>
            ))}
          </div>
        </Section>

        {/* 4 — Plan length */}
        <Section n={4} title="Plan length (prepaid)">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {SUB_PLAN_BOX_OPTIONS.map((n) => (
              <Choice key={n} selected={planBoxes === n} onClick={() => setPlanBoxes(n)}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{n}</div>
                <div style={{ color: COLORS.muted, fontSize: 12 }}>boxes</div>
                <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{rp(subPlanAmount(boxSize, n))}</div>
                <div style={{ color: COLORS.orange, fontSize: 11, fontWeight: 700 }}>+{subFreeCookies(boxSize, n)} free 🍪</div>
              </Choice>
            ))}
          </div>
        </Section>

        {/* 5 — Fulfilment */}
        <Section n={5} title="Delivery or pickup">
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <button onClick={() => setFulfilment("delivery")} style={tabStyle(fulfilment === "delivery")}>Delivery</button>
            <button onClick={() => setFulfilment("pickup")} style={tabStyle(fulfilment === "pickup")}>Pickup</button>
          </div>
          {fulfilment === "delivery" ? (
            <div style={{ display: "grid", gap: 10 }}>
              <textarea
                value={address} onChange={(e) => setAddress(e.target.value)}
                placeholder="Full delivery address"
                rows={3} style={inputStyle}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input value={building} onChange={(e) => setBuilding(e.target.value)} placeholder="Building / unit (optional)" style={inputStyle} />
                <input value={postal} onChange={(e) => setPostal(e.target.value)} placeholder="Postal code" inputMode="numeric" style={inputStyle} />
              </div>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery notes (optional)" style={inputStyle} />
              <p style={{ color: COLORS.muted, fontSize: 12, margin: 0 }}>
                We’ll text you 2 days &amp; 1 day before each box to confirm you’re in town.
              </p>
            </div>
          ) : pickupPoints.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              {pickupPoints.map((p) => (
                <Choice key={p.id} selected={pickupPointId === p.id} onClick={() => setPickupPointId(p.id)} row>
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  <div style={{ color: COLORS.muted, fontSize: 12 }}>{p.address}</div>
                </Choice>
              ))}
            </div>
          ) : (
            <p style={{ color: COLORS.muted }}>No pickup points configured.</p>
          )}
        </Section>

        {err && <Banner tone="error">{err}</Banner>}
      </div>

      {/* Sticky pay bar */}
      <div
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff",
          borderTop: "1px solid #eee", boxShadow: "0 -8px 24px rgba(0,0,0,0.06)",
          padding: "12px 16px", zIndex: 40,
        }}
      >
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: COLORS.black }}>{rp(planTotal)} · {planBoxes} boxes</div>
            <div style={{ color: COLORS.muted, fontSize: 12 }}>
              1 box of {boxSize} {freqAdverb} · {planBoxes} deliveries over ~{durationText} · {rp(perBox)}/box
            </div>
          </div>
          <button
            onClick={subscribe}
            disabled={loading || !valid}
            style={{
              background: valid ? COLORS.orange : "#d9d4cc",
              color: "#fff", border: "none", borderRadius: RADIUS.pill,
              padding: "13px 26px", fontWeight: 800, fontSize: 16,
              cursor: loading || !valid ? "default" : "pointer", whiteSpace: "nowrap",
            }}
          >
            {loading ? "Starting…" : signedIn === false ? "Sign in & subscribe" : "Subscribe with QRIS"}
          </button>
        </div>
      </div>
    </main>
  );
}

/* ---------- small presentational helpers ---------- */
function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 22 }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, color: COLORS.black, margin: "0 0 10px", display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ background: COLORS.blue, color: "#fff", borderRadius: 999, width: 24, height: 24, display: "grid", placeItems: "center", fontSize: 13 }}>{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
function Choice({ selected, onClick, children, row }: { selected: boolean; onClick: () => void; children: React.ReactNode; row?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left", border: `2px solid ${selected ? COLORS.blue : "#e3e0d9"}`,
        background: "#fff", borderRadius: 14, padding: row ? "12px 14px" : "14px 16px",
        cursor: "pointer", boxShadow: selected ? "0 6px 18px rgba(0,20,167,0.12)" : "none",
      }}
    >
      {children}
    </button>
  );
}
function StepBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick} disabled={disabled} aria-label={label === "+" ? "increase" : "decrease"}
      style={{
        width: 30, height: 30, borderRadius: 8, border: "1px solid #ddd",
        background: disabled ? "#f4f2ee" : "#fff", color: disabled ? "#bbb" : COLORS.black,
        fontSize: 18, fontWeight: 700, cursor: disabled ? "default" : "pointer", lineHeight: 1,
      }}
    >
      {label}
    </button>
  );
}
function Banner({ tone, children }: { tone: "info" | "error"; children: React.ReactNode }) {
  const bg = tone === "error" ? "#FFEBE6" : "#EAF0FF";
  const fg = tone === "error" ? "#B3261E" : COLORS.blue;
  return (
    <div style={{ background: bg, color: fg, borderRadius: 12, padding: "10px 14px", marginTop: 14, fontSize: 14, fontWeight: 600 }}>
      {children}
    </div>
  );
}
const inputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid #ddd", borderRadius: 10, padding: "11px 12px", fontSize: 15, background: "#fff", color: COLORS.black,
};
function tabStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1, border: `2px solid ${active ? COLORS.blue : "#e3e0d9"}`, background: active ? COLORS.blue : "#fff",
    color: active ? "#fff" : COLORS.black, borderRadius: 10, padding: "10px", fontWeight: 700, cursor: "pointer",
  };
}
