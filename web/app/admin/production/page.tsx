"use client";

// web/app/admin/production/page.tsx — suggested baking plan (recipes per base).
import { useCallback, useEffect, useState } from "react";
import { COLORS } from "@/lib/theme";

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

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const j = await (await fetch(`/api/admin/production?window=${windowDays}&horizon=${horizon}`, { cache: "no-store" })).json();
      if (j?.ok) setPlan(j.plan); else setErr(j?.error || "Could not load plan.");
    } catch (e: any) { setErr(e?.message || "Error"); } finally { setLoading(false); }
  }, [windowDays, horizon]);
  useEffect(() => { load(); }, [load]);

  const pill = (active: boolean): React.CSSProperties => ({
    border: `1px solid ${active ? COLORS.blue : "rgba(0,0,0,0.18)"}`, background: active ? COLORS.blue : "#fff",
    color: active ? "#fff" : COLORS.black, borderRadius: 999, padding: "6px 12px", fontWeight: 800, fontSize: 13, cursor: "pointer",
  });

  return (
    <main style={{ minHeight: "100vh", background: COLORS.sand }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 18px 80px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: COLORS.black, margin: 0 }}>🧑‍🍳 Production plan</h1>
        <p style={{ color: COLORS.muted, fontSize: 13, marginTop: 6 }}>
          How many recipes to bake, from your live stock + recent sales. 1 recipe = {plan?.recipeSize ?? 11} cookies of a base;
          smallest batch is ½ a recipe per flavour. Cookies sold faster than you have in stock get topped up.
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
        </section>

        {err ? <p style={{ color: "#C0392B", fontWeight: 700, fontSize: 13, marginTop: 12 }}>{err}</p> : null}
        {loading ? <p style={{ color: COLORS.muted, fontSize: 13, marginTop: 14 }}>Calculating…</p> : plan ? (
          <>
            <section style={{ ...card, background: "linear-gradient(135deg,#EAF0FF,#F5F8FF)", borderColor: "rgba(0,20,167,0.25)" }}>
              <div style={{ fontSize: 13, color: COLORS.muted }}>Suggested bake (covers ~{plan.horizonDays} days)</div>
              <div style={{ fontSize: 22, fontWeight: 950, color: COLORS.black, marginTop: 4 }}>
                {plan.totalRecipes > 0
                  ? plan.bases.filter((b) => b.recipes > 0).map((b) => `${fmtRecipes(b.recipes)} ${b.base}`).join("  +  ") + `  =  ${fmtRecipes(plan.totalRecipes)} recipe${plan.totalRecipes === 1 ? "" : "s"}`
                  : "All stocked — nothing to bake right now ✅"}
              </div>
              <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 6 }}>From {plan.paidOrders} paid orders in the last {plan.windowDays} days.</div>
            </section>

            {plan.bases.map((b) => (
              <section key={b.base} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: COLORS.black }}>{BASE_LABEL[b.base]}</div>
                  <div style={{ fontWeight: 900, color: b.recipes > 0 ? COLORS.blue : COLORS.muted }}>
                    {b.recipes > 0 ? `Bake ${fmtRecipes(b.recipes)} recipe${b.recipes === 1 ? "" : "s"} (${b.cookies} cookies)` : "Fully stocked"}
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
                        <th style={th}>Bake</th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.flavours.map((f) => {
                        const out = f.stock === 0;
                        return (
                          <tr key={f.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)", background: f.recipes > 0 ? "rgba(0,20,167,0.03)" : undefined }}>
                            <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{f.name} {out ? <span style={{ color: "#C0392B", fontWeight: 800, fontSize: 11 }}>· OUT</span> : null}</td>
                            <td style={td}>{f.perDay.toFixed(2)}</td>
                            <td style={{ ...td, color: out ? "#C0392B" : COLORS.black, fontWeight: out ? 800 : 400 }}>{f.stock}</td>
                            <td style={td}>{f.need > 0 ? f.need : "—"}</td>
                            <td style={{ ...td, fontWeight: 900, color: f.recipes > 0 ? COLORS.blue : COLORS.muted }}>{fmtRecipes(f.recipes)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
            <p style={{ color: COLORS.muted, fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
              <b>How it works:</b> for each flavour, expected demand = (sales/day over the last {plan.windowDays} days) × {plan.horizonDays} days.
              We subtract current stock (all locations) to get what&apos;s short, then round up to the next ½-recipe. Same flavour sold as a
              smoothie isn&apos;t counted here — only cookies.
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}
