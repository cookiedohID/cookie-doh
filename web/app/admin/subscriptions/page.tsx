"use client";

// web/app/admin/subscriptions/page.tsx — admin view of subscriptions.
// Lists every subscription (config, status, prepaid boxes left, refunds owed),
// the boxes due in the next 3 days, and any "made but no order" orphans. Lets the
// owner mark a refund as paid and trigger today's autopilot manually.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { COLORS } from "@/lib/theme";
import { FREQUENCY_LABEL, type SubFrequency } from "@/lib/subscriptions";

const idr = (n?: number) => (typeof n === "number" ? "Rp " + n.toLocaleString("id-ID") : "—");
function fmt(iso?: string | null) {
  if (!iso) return "—";
  try { return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }); }
  catch { return iso; }
}
const STATUS_COLOR: Record<string, string> = {
  active: "#1F9D57", paused: "#B26A00", completed: "#5A5A5A", cancelled: "#B3261E",
};

export default function AdminSubscriptionsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/admin/subscriptions", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load");
      setData(json);
    } catch (e: any) { setErr(e?.message || "Failed to load"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const subById = (id: string) => (data?.subscriptions || []).find((s: any) => s.id === id);

  async function post(payload: any, okMsg: string) {
    setBusy(true); setMsg(null); setErr(null);
    try {
      const res = await fetch("/api/admin/subscriptions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Action failed");
      setMsg(okMsg + (json.result ? ` (made ${json.result.materialized.made}, reminders ${json.result.reminders.sent})` : ""));
      await load();
    } catch (e: any) { setErr(e?.message || "Action failed"); }
    finally { setBusy(false); }
  }

  const subs = data?.subscriptions || [];
  const active = subs.filter((s: any) => s.status === "active").length;
  const refundsOwed = subs.filter((s: any) => s.refund_status === "pending");

  return (
    <main style={{ minHeight: "100vh", background: COLORS.sand }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 18px 80px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <Link href="/admin" style={{ color: COLORS.blue, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>← Admin</Link>
            <h1 style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 800 }}>Subscriptions</h1>
          </div>
          <button onClick={() => post({ action: "run_cron" }, "Autopilot ran")} disabled={busy}
            style={{ background: COLORS.blue, color: "#fff", border: "none", borderRadius: 999, padding: "10px 18px", fontWeight: 700, cursor: busy ? "default" : "pointer" }}>
            {busy ? "Running…" : "Run autopilot now"}
          </button>
        </div>

        {msg && <Note bg="#E6F6EC" fg="#1F9D57">{msg}</Note>}
        {err && <Note bg="#FBE9E7" fg="#B3261E">{err}</Note>}

        {loading ? <p style={{ color: COLORS.muted, marginTop: 20 }}>Loading…</p> : (
          <>
            <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
              <KPI label="Active" value={String(active)} />
              <KPI label="Total" value={String(subs.length)} />
              <KPI label="Due ≤3 days" value={String((data?.dueSoon || []).length)} />
              <KPI label="Refunds owed" value={String(refundsOwed.length)} accent={refundsOwed.length ? "#B3261E" : undefined} />
              <KPI label="Needs attention" value={String((data?.needsAttention || []).length)} accent={(data?.needsAttention || []).length ? "#B26A00" : undefined} />
            </div>

            {/* Due soon */}
            <Section title="Boxes due in the next 3 days">
              {(data?.dueSoon || []).length === 0 ? <Empty>Nothing due.</Empty> : (
                <Table head={["Date", "Customer", "Box", "Seq"]}>
                  {(data.dueSoon).map((d: any) => {
                    const s = subById(d.subscription_id);
                    return (
                      <tr key={d.id} style={rowStyle}>
                        <Td><b>{fmt(d.scheduled_for)}</b></Td>
                        <Td>{s?.name || s?.owner_phone || "—"}</Td>
                        <Td>Box of {s?.box_size} · {s?.mode === "fixed" ? "fixed" : "curated"} · {s?.fulfilment}</Td>
                        <Td>#{d.seq}</Td>
                      </tr>
                    );
                  })}
                </Table>
              )}
            </Section>

            {/* Needs attention */}
            {(data?.needsAttention || []).length > 0 && (
              <Section title="⚠️ Made but no order (reconcile)">
                <Table head={["When", "Customer", "Seq"]}>
                  {(data.needsAttention).map((d: any) => {
                    const s = subById(d.subscription_id);
                    return (
                      <tr key={d.id} style={rowStyle}>
                        <Td>{d.made_at ? new Date(d.made_at).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" }) : "—"}</Td>
                        <Td>{s?.name || s?.owner_phone || "—"}</Td>
                        <Td>#{d.seq}</Td>
                      </tr>
                    );
                  })}
                </Table>
              </Section>
            )}

            {/* All subscriptions */}
            <Section title="All subscriptions">
              {subs.length === 0 ? <Empty>No subscriptions yet.</Empty> : (
                <Table head={["Customer", "Plan", "Status", "Boxes left", "Next", "Refund", ""]}>
                  {subs.map((s: any) => (
                    <tr key={s.id} style={rowStyle}>
                      <Td>
                        <div style={{ fontWeight: 700 }}>{s.name || "—"}</div>
                        <div style={{ color: COLORS.muted, fontSize: 12 }}>{s.owner_phone}</div>
                      </Td>
                      <Td>
                        Box of {s.box_size} · {s.mode === "fixed" ? "Fixed" : "Curated"}
                        <div style={{ color: COLORS.muted, fontSize: 12 }}>{FREQUENCY_LABEL[s.frequency as SubFrequency]} · {s.fulfilment}</div>
                      </Td>
                      <Td><span style={{ color: STATUS_COLOR[s.status] || COLORS.muted, fontWeight: 700, textTransform: "capitalize" }}>{s.status}</span></Td>
                      <Td><b>{s.remaining}</b></Td>
                      <Td>{s.status === "active" ? fmt(s.next_delivery_on) : "—"}</Td>
                      <Td>
                        {s.refund_idr ? (
                          <span style={{ color: s.refund_status === "paid" ? "#1F9D57" : "#B3261E", fontWeight: 700 }}>
                            {idr(s.refund_idr)} {s.refund_status === "paid" ? "✓" : "(owed)"}
                          </span>
                        ) : "—"}
                      </Td>
                      <Td>
                        {s.refund_status === "pending" && (
                          <button onClick={() => post({ action: "refund_paid", subscription_id: s.id }, "Refund marked paid")} disabled={busy}
                            style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            Mark refunded
                          </button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>
          </>
        )}
      </div>
    </main>
  );
}

const rowStyle: React.CSSProperties = { borderTop: "1px solid #eee" };
function Section({ title, children }: any) {
  return (
    <section style={{ marginTop: 26 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 10px" }}>{title}</h2>
      <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 14, overflow: "hidden" }}>{children}</div>
    </section>
  );
}
function Table({ head, children }: any) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <thead>
        <tr>{head.map((h: string, i: number) => (
          <th key={i} style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>{h}</th>
        ))}</tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
function Td({ children }: any) { return <td style={{ padding: "10px 12px", verticalAlign: "top" }}>{children}</td>; }
function KPI({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 12, padding: "12px 18px", minWidth: 120 }}>
      <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent || COLORS.black }}>{value}</div>
    </div>
  );
}
function Empty({ children }: any) { return <div style={{ padding: 16, color: COLORS.muted }}>{children}</div>; }
function Note({ bg, fg, children }: any) {
  return <div style={{ background: bg, color: fg, borderRadius: 10, padding: "10px 14px", marginTop: 14, fontWeight: 600 }}>{children}</div>;
}
