"use client";

// web/app/admin/production/page.tsx — suggested baking plan (recipes per base),
// overridable per flavour, then "Add to inventory" to push the baked cookies
// into a location's stock (POST /api/admin/production).
import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS } from "@/lib/theme";
import { LOCATIONS, DEFAULT_LOCATION_ID } from "@/lib/locations";

const card: React.CSSProperties = { background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16, marginTop: 14 };
const th: React.CSSProperties = { textAlign: "right", fontSize: 11, fontWeight: 800, color: COLORS.muted, padding: "4px 8px", whiteSpace: "nowrap" };
const td: React.CSSProperties = { textAlign: "right", fontSize: 13, color: COLORS.black, padding: "6px 8px", whiteSpace: "nowrap" };

type Flav = { id: string; name: string; base: string; sold: number; perDay: number; stock: number; forecast: number; need: number; recipes: number };
type Base = { base: "dark" | "light"; recipes: number; cookies: number; flavours: Flav[] };
type Plan = { windowDays: number; horizonDays: number; recipeSize: number; paidOrders: number; bases: Base[]; totalRecipes: number };

function fmtRecipes(n: number): string {
  if (!n) return "—";
  const whole = Math.floor(n);
  const half = n - whole >= 0.5;
  return `${whole || ""}${half ? "½" : ""}` || "0";
}

const BASE_LABEL: Record<string, string> = { dark: "🌑 Dark base", light: "🌕 Light base" };

export default function ProductionPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [horizon, setHorizon] = useState(14);
  const [windowDays, setWindowDays] = useState(28);

  // Editable "make" amounts (cookies) per flavour + where they get added.
  const [qty, setQty] = useState<Record<string, number>>({});
  const [locationId, setLocationId] = useState<string>(DEFAULT_LOCATION_ID);
  const [notify, setNotify] = useState(true); // WhatsApp back-in-stock subscribers on a bake
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const recipeSize = plan?.recipeSize ?? 11;

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const j = await (await fetch(`/api/admin/production?window=${windowDays}&horizon=${horizon}`, { cache: "no-store" })).json();
      if (j?.ok) {
        setPlan(j.plan);
        // Pre-fill each flavour's "make" box with the suggestion (recipes → cookies).
        const seed: Record<string, number> = {};
        for (const b of j.plan.bases as Base[]) for (const f of b.flavours) seed[f.id] = Math.round(f.recipes * (j.plan.recipeSize || 11));
        setQty(seed);
      } else setErr(j?.error || "Could not load plan.");
    } catch (e: any) { setErr(e?.message || "Error"); } finally { setLoading(false); }
  }, [windowDays, horizon]);
  useEffect(() => { load(); }, [load]);

  const setFlavourQty = (id: string, v: string) => {
    const n = Math.max(0, Math.floor(Number(v) || 0));
    setQty((q) => ({ ...q, [id]: n }));
    setMsg("");
  };

  // Live totals from the (possibly edited) amounts.
  const totals = useMemo(() => {
    const items = Object.entries(qty).filter(([, c]) => c > 0).map(([id, cookies]) => ({ id, cookies }));
    const cookies = items.reduce((n, i) => n + i.cookies, 0);
    return { items, cookies, recipes: cookies / recipeSize };
  }, [qty, recipeSize]);

  const cookiesForBase = (b: Base) => b.flavours.reduce((n, f) => n + (qty[f.id] || 0), 0);

  const addToInventory = useCallback(async () => {
    if (!totals.items.length || saving) return;
    const loc = LOCATIONS.find((l) => l.id === locationId);
    const confirmMsg = `Add ${totals.cookies} cookies to ${loc?.short || locationId} stock?`
      + (notify ? "\n\n🔔 Any sold-out flavour that comes back will WhatsApp its waiting subscribers." : "");
    if (!window.confirm(confirmMsg)) return;
    setSaving(true); setErr(""); setMsg("");
    try {
      const j = await (await fetch("/api/admin/production", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: locationId, items: totals.items, notify }),
      })).json();
      if (j?.ok) {
        const alertBit = j.alerted ? ` · 🔔 alerted ${j.alerted} subscriber${j.alerted === 1 ? "" : "s"}` : "";
        setMsg(`✅ Added ${j.totalCookies} cookies to ${loc?.short || locationId}. Stock updated.${alertBit}`);
        await load(); // refresh — stock is now higher, suggestions drop
      } else setErr(j?.error || "Could not add to inventory.");
    } catch (e: any) { setErr(e?.message || "Error"); } finally { setSaving(false); }
  }, [totals, saving, locationId, notify, load]);

  const pill = (active: boolean): React.CSSProperties => ({
    border: `1px solid ${active ? COLORS.blue : "rgba(0,0,0,0.18)"}`, background: active ? COLORS.blue : "#fff",
    color: active ? "#fff" : COLORS.black, borderRadius: 999, padding: "6px 12px", fontWeight: 800, fontSize: 13, cursor: "pointer",
  });

  return (
    <main style={{ minHeight: "100vh", background: COLORS.sand }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 18px 120px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: COLORS.black, margin: 0 }}>🧑‍🍳 Production plan</h1>
        <p style={{ color: COLORS.muted, fontSize: 13, marginTop: 6 }}>
          How many recipes to bake, from your live stock + recent sales. 1 recipe = {recipeSize} cookies of a base;
          smallest batch is ½ a recipe per flavour (≈{Math.round(recipeSize / 2)} cookies). Edit any amount, then
          <b> add to inventory</b> to top up your stock.
        </p>

        <section style={{ ...card, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.muted, marginBottom: 4 }}>BAKE TO COVER</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[7, 14, 30].map((d) => <button key={d} onClick={() => setHorizon(d)} style={pill(horizon === d)}>{d} days</button>)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.muted, marginBottom: 4 }}>BASED ON SALES FROM</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[14, 28, 56].map((d) => <button key={d} onClick={() => setWindowDays(d)} style={pill(windowDays === d)}>last {d}d</button>)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.muted, marginBottom: 4 }}>ADD BAKED COOKIES TO</div>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)}
              style={{ border: "1px solid rgba(0,0,0,0.18)", borderRadius: 10, padding: "7px 10px", fontWeight: 700, fontSize: 13, background: "#fff", color: COLORS.black }}>
              {LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.short}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.muted, marginBottom: 4 }}>BACK-IN-STOCK ALERTS</div>
            <label title="When a flavour that was sold out everywhere comes back, WhatsApp everyone who asked to be notified."
              style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, color: COLORS.black, border: "1px solid rgba(0,0,0,0.18)", borderRadius: 10, padding: "7px 10px", background: "#fff" }}>
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} style={{ width: 16, height: 16, accentColor: COLORS.blue }} />
              {notify ? "🔔 On — WhatsApp subscribers" : "🔕 Off — no alerts"}
            </label>
          </div>
        </section>

        {err ? <p style={{ color: "#C0392B", fontWeight: 700, fontSize: 13, marginTop: 12 }}>{err}</p> : null}
        {msg ? <p style={{ color: "#1E7F43", fontWeight: 800, fontSize: 13, marginTop: 12 }}>{msg}</p> : null}
        {loading ? <p style={{ color: COLORS.muted, fontSize: 13, marginTop: 14 }}>Calculating…</p> : plan ? (
          <>
            <section style={{ ...card, background: "linear-gradient(135deg,#EAF0FF,#F5F8FF)", borderColor: "rgba(0,20,167,0.25)" }}>
              <div style={{ fontSize: 13, color: COLORS.muted }}>Suggested bake (covers ~{plan.horizonDays} days)</div>
              <div style={{ fontSize: 22, fontWeight: 950, color: COLORS.black, marginTop: 4 }}>
                {plan.totalRecipes > 0
                  ? plan.bases.filter((b) => b.recipes > 0).map((b) => `${fmtRecipes(b.recipes)} ${b.base}`).join("  +  ") + `  =  ${fmtRecipes(plan.totalRecipes)} recipe${plan.totalRecipes === 1 ? "" : "s"}`
                  : "All stocked — nothing to bake right now ✅"}
              </div>
              <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 6 }}>From {plan.paidOrders} paid orders in the last {plan.windowDays} days. Adjust the “Make” boxes below before adding to stock.</div>
            </section>

            {plan.bases.map((b) => {
              const makingCookies = cookiesForBase(b);
              return (
                <section key={b.base} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ fontSize: 15, fontWeight: 900, color: COLORS.black }}>{BASE_LABEL[b.base]}</div>
                    <div style={{ fontWeight: 900, color: makingCookies > 0 ? COLORS.blue : COLORS.muted, fontSize: 13 }}>
                      {makingCookies > 0 ? `Making ${makingCookies} cookies ≈ ${fmtRecipes(Math.round((makingCookies / recipeSize) * 2) / 2)} recipe${makingCookies > recipeSize ? "s" : ""}` : "Nothing set"}
                    </div>
                  </div>
                  <div style={{ overflowX: "auto", marginTop: 8 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                          <th style={{ ...th, textAlign: "left" }}>Flavour</th>
                          <th style={th}>Sold/day</th>
                          <th style={th}>Stock</th>
                          <th style={th}>Need ({plan.horizonDays}d)</th>
                          <th style={th}>Suggest</th>
                          <th style={th}>Make 🍪</th>
                        </tr>
                      </thead>
                      <tbody>
                        {b.flavours.map((f) => {
                          const out = f.stock === 0;
                          const making = qty[f.id] || 0;
                          return (
                            <tr key={f.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)", background: making > 0 ? "rgba(0,20,167,0.03)" : undefined }}>
                              <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{f.name} {out ? <span style={{ color: "#C0392B", fontWeight: 800, fontSize: 11 }}>· OUT</span> : null}</td>
                              <td style={td}>{f.perDay.toFixed(2)}</td>
                              <td style={{ ...td, color: out ? "#C0392B" : COLORS.black, fontWeight: out ? 800 : 400 }}>{f.stock}</td>
                              <td style={td}>{f.need > 0 ? f.need : "—"}</td>
                              <td style={{ ...td, color: f.recipes > 0 ? COLORS.blue : COLORS.muted }}>{fmtRecipes(f.recipes)}</td>
                              <td style={{ ...td, padding: "4px 8px" }}>
                                <input inputMode="numeric" value={making || ""} placeholder="0"
                                  onChange={(e) => setFlavourQty(f.id, e.target.value)}
                                  style={{ width: 58, textAlign: "right", border: "1px solid rgba(0,0,0,0.2)", borderRadius: 8, padding: "5px 7px", fontSize: 13, fontWeight: 800, color: COLORS.black }} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}

            {/* Commit bar */}
            <section style={{ ...card, position: "sticky", bottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", boxShadow: "0 6px 24px rgba(0,0,0,0.12)" }}>
              <div style={{ fontSize: 13, color: COLORS.black }}>
                {totals.cookies > 0
                  ? <><b>{totals.cookies}</b> cookies (≈ {fmtRecipes(Math.round(totals.recipes * 2) / 2)} recipe{totals.cookies > recipeSize ? "s" : ""}) → <b>{LOCATIONS.find((l) => l.id === locationId)?.short}</b></>
                  : <span style={{ color: COLORS.muted }}>Set “Make” amounts above to add stock.</span>}
              </div>
              <button onClick={addToInventory} disabled={saving || totals.cookies === 0}
                style={{ border: "none", borderRadius: 12, padding: "11px 18px", fontWeight: 900, fontSize: 14, cursor: saving || totals.cookies === 0 ? "default" : "pointer",
                  background: totals.cookies === 0 ? "rgba(0,0,0,0.12)" : COLORS.blue, color: totals.cookies === 0 ? COLORS.muted : "#fff" }}>
                {saving ? "Adding…" : "✓ Add to inventory"}
              </button>
            </section>

            <p style={{ color: COLORS.muted, fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
              <b>How it works:</b> for each flavour, expected demand = (sales/day over the last {plan.windowDays} days) × {plan.horizonDays} days.
              We subtract current stock (all locations) to get what&apos;s short, then round up to the next ½-recipe. The <b>Make</b> boxes start
              from that suggestion — edit them to whatever you actually baked, then <b>Add to inventory</b> to raise stock at the chosen location.
              Same flavour sold as a smoothie isn&apos;t counted here — only cookies.
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}
