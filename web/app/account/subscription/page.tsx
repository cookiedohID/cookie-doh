"use client";

// web/app/account/subscription/page.tsx — "My Subscription" management.
// Lists the signed-in member's subscriptions and lets them skip the next box,
// pause/resume, edit (favourites / frequency / address), renew (prepay more
// boxes), or cancel (with a refund of unused prepaid boxes). All actions hit
// server routes that re-verify ownership.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FLAVORS } from "@/lib/catalog";
import { COLORS, RADIUS } from "@/lib/theme";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import {
  SUB_PLAN_BOX_OPTIONS, SUB_FREQUENCIES, FREQUENCY_LABEL, subPlanGrandTotal, subBoxPrice,
  type SubFrequency, type SubMode,
} from "@/lib/subscriptions";

const rp = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");
function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
      weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Jakarta",
    });
  } catch { return iso; }
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  active: { bg: "#E6F6EC", fg: "#1F9D57", label: "Active" },
  paused: { bg: "#FFF4E0", fg: "#B26A00", label: "Paused" },
  completed: { bg: "#EEF0F4", fg: "#5A5A5A", label: "Completed" },
  cancelled: { bg: "#FBE9E7", fg: "#B3261E", label: "Cancelled" },
  pending_payment: { bg: "#EEF0F4", fg: "#5A5A5A", label: "Awaiting payment" },
};

type Sub = any;

export default function MySubscriptionPage() {
  const router = useRouter();
  const cookies = useMemo(() => FLAVORS.filter((f: any) => !f.soldOut), []);

  const [subs, setSubs] = useState<Sub[]>([]);
  const [favourites, setFavourites] = useState<{ id: string; name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Sub | null>(null);
  const [renewing, setRenewing] = useState<Sub | null>(null);

  const token = useCallback(async () => {
    const { data } = await getSupabaseBrowser().auth.getSession();
    return data.session?.access_token || null;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const t = await token();
      if (!t) { router.replace("/account?next=/account/subscription"); return; }
      const res = await fetch("/api/subscriptions/me", { headers: { Authorization: `Bearer ${t}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load subscriptions.");
      setSubs(json.subscriptions || []);
      // Most-ordered cookies, for the edit-modal quick-fill.
      try {
        const fr = await fetch("/api/account/favourites", { headers: { Authorization: `Bearer ${t}` } });
        const fj = await fr.json();
        if (fj?.ok && Array.isArray(fj.favourites)) setFavourites(fj.favourites);
      } catch { /* nicety — ignore */ }
    } catch (e: any) {
      setErr(e?.message || "Could not load subscriptions.");
    } finally {
      setLoading(false);
    }
  }, [router, token]);

  useEffect(() => { load(); }, [load]);

  async function act(subId: string, action: string, extra: any = {}) {
    setBusyId(subId);
    setErr(null);
    try {
      const t = await token();
      const res = await fetch("/api/subscriptions/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ subscription_id: subId, action, ...extra }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Action failed.");
      setEditing(null);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function renew(sub: Sub, boxes: number) {
    setBusyId(sub.id);
    setErr(null);
    try {
      if (!(window as any).snap?.pay) throw new Error("Payment is still loading — refresh and try again.");
      const t = await token();
      const res = await fetch("/api/subscriptions/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ renew_subscription_id: sub.id, boxes }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not start renewal.");
      setRenewing(null);
      (window as any).snap.pay(String(json.snap_token), {
        onSuccess: () => load(),
        onPending: () => load(),
        onError: (r: any) => setErr(r?.status_message || "Payment failed."),
        onClose: () => {},
      });
    } catch (e: any) {
      setErr(e?.message || "Could not start renewal.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main style={{ background: COLORS.bg, minHeight: "100vh" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 16px 60px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: COLORS.black, margin: 0 }}>My Subscription</h1>
          <a href="/account" style={{ color: COLORS.blue, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>← Account</a>
        </div>

        {err && (
          <div style={{ background: "#FBE9E7", color: "#B3261E", borderRadius: 12, padding: "10px 14px", marginTop: 14, fontWeight: 600 }}>
            {err}
          </div>
        )}

        {loading ? (
          <p style={{ color: COLORS.muted, marginTop: 24 }}>Loading…</p>
        ) : subs.length === 0 ? (
          <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 18, padding: 24, marginTop: 18, textAlign: "center" }}>
            <p style={{ fontWeight: 700, fontSize: 17, margin: "0 0 6px" }}>You don’t have a subscription yet</p>
            <p style={{ color: COLORS.muted, margin: "0 0 16px" }}>Prepay a plan — buy 6 cookies, get 1 free.</p>
            <a href="/subscribe" style={{ display: "inline-block", background: COLORS.orange, color: "#fff", fontWeight: 800, padding: "12px 24px", borderRadius: 999, textDecoration: "none" }}>
              Start a subscription
            </a>
          </div>
        ) : (
          subs.map((sub) => {
            const st = STATUS_STYLE[sub.status] || STATUS_STYLE.completed;
            const nextScheduled = (sub.upcoming || []).find((d: any) => d.status === "scheduled");
            const busy = busyId === sub.id;
            return (
              <div key={sub.id} style={{ background: "#fff", border: "1px solid #eee", borderRadius: 18, padding: 18, marginTop: 18, boxShadow: "0 8px 24px rgba(0,0,0,0.04)" }}>
                {/* header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>Box of {sub.box_size} · {sub.mode === "fixed" ? "Fixed favourites" : "Curated surprise"}</div>
                  <span style={{ background: st.bg, color: st.fg, borderRadius: 999, padding: "4px 12px", fontWeight: 800, fontSize: 12 }}>{st.label}</span>
                </div>
                <div style={{ color: COLORS.muted, fontSize: 14, marginTop: 4 }}>
                  {FREQUENCY_LABEL[sub.frequency as SubFrequency]} · {sub.fulfilment === "pickup" ? "Pickup" : "Delivery"}
                </div>

                {/* fixed flavours */}
                {sub.mode === "fixed" && Array.isArray(sub.fixed_flavours) && sub.fixed_flavours.length > 0 && (
                  <div style={{ color: COLORS.black, fontSize: 13, marginTop: 8 }}>
                    {sub.fixed_flavours.map((f: any) => `${f.name}${f.quantity > 1 ? ` ×${f.quantity}` : ""}`).join(", ")}
                  </div>
                )}

                {/* stats */}
                <div style={{ display: "flex", gap: 22, marginTop: 14, flexWrap: "wrap" }}>
                  <Stat label="Next box" value={sub.status === "active" ? fmtDate(nextScheduled?.scheduled_for || sub.next_delivery_on) : "—"} />
                  <Stat label="Boxes left" value={String(sub.remaining ?? 0)} />
                </div>

                {/* Subscription rewards — separate from the regular buy-10-get-1 loyalty */}
                <div style={{ marginTop: 12, background: "#FFF6EC", borderRadius: 12, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.muted, textTransform: "uppercase" }}>Subscription rewards</div>
                    <div style={{ fontSize: 14, color: COLORS.black, marginTop: 2 }}>
                      <b>{sub.cookiesPurchased ?? 0}</b> cookies purchased · <b style={{ color: COLORS.orange }}>{sub.rewardCookies ?? 0}</b> free earned
                    </div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.orange, textAlign: "right", whiteSpace: "nowrap" }}>buy 6,<br />get 1 free</div>
                </div>

                {/* refund note */}
                {sub.status === "cancelled" && sub.refund_idr > 0 && (
                  <div style={{ background: "#FFF4E0", color: "#B26A00", borderRadius: 10, padding: "8px 12px", marginTop: 12, fontSize: 13, fontWeight: 600 }}>
                    Refund of {rp(sub.refund_idr)} for {sub.remaining} unused box{sub.remaining === 1 ? "" : "es"} — {sub.refund_status === "paid" ? "paid" : "being processed"}.
                  </div>
                )}

                {/* upcoming */}
                {sub.status === "active" && (sub.upcoming || []).length > 0 && (
                  <div style={{ marginTop: 12, borderTop: "1px solid #f0eee9", paddingTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, marginBottom: 6 }}>UPCOMING</div>
                    {(sub.upcoming || []).slice(0, 4).map((d: any) => (
                      <div key={d.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
                        <span>{fmtDate(d.scheduled_for)}</span>
                        <span style={{ color: d.status === "scheduled" ? COLORS.blue : COLORS.muted, fontWeight: 600 }}>
                          {d.status === "scheduled" ? "Scheduled" : d.status === "made" ? "Preparing" : "Delivered"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* actions */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
                  {sub.status === "active" && (
                    <>
                      <Btn onClick={() => act(sub.id, "skip")} disabled={busy || !nextScheduled}>Skip next box</Btn>
                      <Btn onClick={() => setEditing(sub)} disabled={busy}>Edit</Btn>
                      <Btn onClick={() => act(sub.id, "pause")} disabled={busy}>Pause</Btn>
                    </>
                  )}
                  {sub.status === "paused" && (
                    <Btn primary onClick={() => act(sub.id, "resume")} disabled={busy || (sub.remaining ?? 0) <= 0}>Resume</Btn>
                  )}
                  {(sub.status === "active" || sub.status === "paused" || sub.status === "completed") && (
                    <Btn primary onClick={() => setRenewing(sub)} disabled={busy}>Add boxes</Btn>
                  )}
                  {(sub.status === "active" || sub.status === "paused") && (
                    <Btn danger onClick={() => { if (confirm("Cancel this subscription? Unused prepaid boxes will be refunded.")) act(sub.id, "cancel"); }} disabled={busy}>
                      Cancel
                    </Btn>
                  )}
                  {sub.status === "cancelled" && (
                    <a href="/subscribe" style={{ ...btnBase(false, false, false), textDecoration: "none", display: "inline-block" }}>Start a new one</a>
                  )}
                </div>

                {/* renew picker */}
                {renewing?.id === sub.id && (
                  <div style={{ marginTop: 14, borderTop: "1px solid #f0eee9", paddingTop: 14 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Add prepaid boxes (box of {sub.box_size})</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {SUB_PLAN_BOX_OPTIONS.map((n) => (
                        <button key={n} onClick={() => renew(sub, n)} disabled={busy} style={btnBase(true, false, false)}>
                          {n} boxes · {rp(subPlanGrandTotal(sub.box_size, n, sub.fulfilment))}
                        </button>
                      ))}
                      <button onClick={() => setRenewing(null)} style={btnBase(false, false, false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {editing && (
        <EditModal
          sub={editing}
          cookies={cookies}
          favourites={favourites}
          busy={busyId === editing.id}
          onClose={() => setEditing(null)}
          onSave={(payload: any) => act(editing.id, "edit", payload)}
        />
      )}
    </main>
  );
}

/* ---------- Edit modal ---------- */
function EditModal({ sub, cookies, favourites, busy, onClose, onSave }: any) {
  const [mode, setMode] = useState<SubMode>(sub.mode);
  const [frequency, setFrequency] = useState<SubFrequency>(sub.frequency);
  const [address, setAddress] = useState<string>(sub.ship_snapshot?.address || "");
  const [picks, setPicks] = useState<Record<string, number>>(() => {
    const o: Record<string, number> = {};
    for (const f of sub.fixed_flavours || []) o[f.id] = f.quantity;
    return o;
  });
  const picksTotal = Object.values(picks).reduce((s, n) => s + n, 0);
  const fixedOk = mode === "curated" || picksTotal === sub.box_size;

  function setPick(id: string, delta: number) {
    setPicks((prev) => {
      const cur = prev[id] || 0;
      const total = Object.values(prev).reduce((s, n) => s + n, 0);
      let next = cur + delta;
      if (next < 0) next = 0;
      if (delta > 0 && total >= sub.box_size) return prev;
      const out = { ...prev, [id]: next };
      if (next === 0) delete out[id];
      return out;
    });
  }

  const favs = (favourites || []).filter((f: any) => cookies.some((c: any) => c.id === f.id));
  function useMyFavourites() {
    if (!favs.length) return;
    const next: Record<string, number> = {};
    let total = 0, i = 0;
    while (total < sub.box_size && i < sub.box_size * favs.length + sub.box_size) {
      const f = favs[i % favs.length];
      next[f.id] = (next[f.id] || 0) + 1;
      total++; i++;
    }
    setPicks(next);
  }

  function save() {
    const payload: any = { mode, frequency };
    if (mode === "fixed") {
      payload.fixed_flavours = Object.entries(picks).map(([id, quantity]) => ({
        id, name: cookies.find((c: any) => c.id === id)?.name || "Cookie", quantity,
      }));
    }
    if (sub.fulfilment === "delivery" && address.trim()) {
      payload.ship_snapshot = { address: address.trim() };
    }
    onSave(payload);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: COLORS.bg, width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", borderRadius: "20px 20px 0 0", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Edit subscription</h2>
          <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 24, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <Label>Contents</Label>
        <div style={{ display: "flex", gap: 8 }}>
          <Chip active={mode === "fixed"} onClick={() => setMode("fixed")}>Fixed favourites</Chip>
          <Chip active={mode === "curated"} onClick={() => setMode("curated")}>Curated surprise</Chip>
        </div>

        {mode === "fixed" && (
          <>
            {favs.length > 0 && (
              <button
                onClick={useMyFavourites}
                style={{ marginTop: 12, background: COLORS.blue, color: "#fff", border: "none", borderRadius: 999, padding: "9px 16px", fontWeight: 800, cursor: "pointer", fontSize: 13 }}
              >
                ⚡ Fill with my favourites
              </button>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
              <Label>Pick {sub.box_size} cookies</Label>
              <span style={{ fontWeight: 800, color: fixedOk ? COLORS.blue : COLORS.orange }}>{picksTotal}/{sub.box_size}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
              {cookies.map((c: any) => {
                const qty = picks[c.id] || 0;
                return (
                  <div key={c.id} style={{ border: `2px solid ${qty > 0 ? COLORS.blue : "#eee"}`, borderRadius: 12, background: "#fff", overflow: "hidden" }}>
                    <div style={{ position: "relative", width: "100%", aspectRatio: "1/1", background: "#f3f0ea" }}>
                      {c.image && <Image src={c.image} alt={c.name} fill sizes="140px" style={{ objectFit: "cover" }} />}
                      {qty > 0 && <span style={{ position: "absolute", top: 5, right: 5, background: COLORS.blue, color: "#fff", borderRadius: 999, minWidth: 20, height: 20, fontSize: 12, fontWeight: 800, display: "grid", placeItems: "center", padding: "0 5px" }}>{qty}</span>}
                    </div>
                    <div style={{ padding: "6px 8px" }}>
                      <div style={{ fontWeight: 700, fontSize: 12, minHeight: 28, lineHeight: 1.2 }}>{c.name}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                        <Step label="−" onClick={() => setPick(c.id, -1)} disabled={qty === 0} />
                        <span style={{ fontWeight: 800 }}>{qty}</span>
                        <Step label="+" onClick={() => setPick(c.id, +1)} disabled={picksTotal >= sub.box_size} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <Label>Frequency</Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SUB_FREQUENCIES.map((f) => (
            <Chip key={f} active={frequency === f} onClick={() => setFrequency(f)}>{FREQUENCY_LABEL[f]}</Chip>
          ))}
        </div>

        {sub.fulfilment === "delivery" && (
          <>
            <Label>Delivery address</Label>
            <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3}
              style={{ width: "100%", border: "1px solid #ddd", borderRadius: 10, padding: "11px 12px", fontSize: 15 }} />
          </>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{ ...btnBase(false, false, false), flex: 1 }}>Cancel</button>
          <button onClick={save} disabled={busy || !fixedOk} style={{ ...btnBase(true, false, false), flex: 2, opacity: busy || !fixedOk ? 0.6 : 1 }}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- bits ---------- */
function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent || COLORS.black }}>{value}</div>
    </div>
  );
}
function btnBase(primary: boolean, danger: boolean, _x: boolean): React.CSSProperties {
  return {
    border: `1.5px solid ${danger ? "#E5B4AE" : primary ? COLORS.orange : "#ddd"}`,
    background: primary ? COLORS.orange : "#fff",
    color: primary ? "#fff" : danger ? "#B3261E" : COLORS.black,
    borderRadius: RADIUS.pill, padding: "9px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer",
  };
}
function Btn({ children, onClick, disabled, primary, danger }: any) {
  return <button onClick={onClick} disabled={disabled} style={{ ...btnBase(!!primary, !!danger, false), opacity: disabled ? 0.5 : 1 }}>{children}</button>;
}
function Chip({ active, onClick, children }: any) {
  return (
    <button onClick={onClick} style={{
      border: `2px solid ${active ? COLORS.blue : "#e3e0d9"}`, background: active ? COLORS.blue : "#fff",
      color: active ? "#fff" : COLORS.black, borderRadius: 999, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13,
    }}>{children}</button>
  );
}
function Step({ label, onClick, disabled }: any) {
  return <button onClick={onClick} disabled={disabled} aria-label={label === "+" ? "increase" : "decrease"} style={{
    width: 28, height: 28, borderRadius: 7, border: "1px solid #ddd", background: disabled ? "#f4f2ee" : "#fff",
    color: disabled ? "#bbb" : COLORS.black, fontSize: 16, fontWeight: 700, cursor: disabled ? "default" : "pointer", lineHeight: 1,
  }}>{label}</button>;
}
function Label({ children }: any) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.muted, margin: "14px 0 8px" }}>{children}</div>;
}
