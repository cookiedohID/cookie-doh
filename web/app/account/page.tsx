"use client";

// web/app/account/page.tsx — the member dashboard ("your little corner").
// Full-screen, sidebar-nav console (Cookie Doh × TBS) ported from the approved
// mockup: a brand-blue header, a left section nav, and six views (Overview, My
// rewards, Orders & plans, Membership, Refer a friend, Account settings). The
// global SiteHeader/Footer/HolidayBanner/WhatsAppButton hide on exactly /account
// so this page owns the viewport. ALL data + actions are the real thing — loyalty
// stamps, VIP tiers, federated TBS rewards + history, member QR, birthday set-once,
// referrals, set/change password, and the Google-user WhatsApp-link onboarding.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { COLORS } from "@/lib/theme";
import { getAccessToken, getSessionEmail, setMemberToken } from "@/lib/memberBrowser";
import { signOutMember } from "@/lib/memberAuth";
import { canonicalPhone } from "@/lib/phone";

type VipT = { name: string; reach_annual_idr: number; maintain_monthly_idr: number; loyalty_per_free: number; free_delivery: boolean; free_cookie_per_order: boolean } | null;
type VipStatus = { annual_idr: number; this_month_idr: number; last_month_idr: number; tier: VipT; next: VipT; reach_remaining_idr: number; maintain_remaining_idr: number };

type Member = {
  name: string | null;
  phone: string;
  memberCode: string;
  birthday: string | null;
  loyalty: { cookieStamps: number; drinkStamps: number; freeCookies: number; freeDrinks: number };
  vip?: VipStatus | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const rpFmt = (n: number) => "Rp" + Number(n || 0).toLocaleString("id-ID");

function vipPerksLine(t: NonNullable<VipT>): string {
  const parts = [`buy ${t.loyalty_per_free} get 1 free`];
  if (t.free_delivery) parts.push("free same-day delivery");
  if (t.free_cookie_per_order) parts.push("a free cookie every order");
  return parts.join(" · ");
}

// ── TotalBuahStore (TBS) rewards — federated view (see /api/account/tbs) ──────────
const TBS_RED = "#9c1216";
const TBS_GREEN = "#135232";

type TbsItem = { sku: string; name: string; qty: number; amount: number; url: string; status: "in_stock" | "out_of_stock" | "discontinued" };
type TbsReceipt = { date: string; store: string; receiptNo: string; total: number; pointsEarned: number; items: TbsItem[] };
type TbsData = {
  member: { name: string | null; tier: string | null; memberSince: string | null };
  points: { balance: number; expiryMonths: number | null; expiring: { amount: number; on: string }[] };
  history: { total: number; offset: number; receipts: TbsReceipt[] };
};

// ── Instant-render cache (stale-while-revalidate) ────────────────────────────
const ACCT_CACHE_KEY = "cd_account_cache";
function writeAccountCache(patch: Partial<{ member: Member; email: string; tbs: TbsData | null }>) {
  try {
    const prev = JSON.parse(sessionStorage.getItem(ACCT_CACHE_KEY) || "null") || {};
    sessionStorage.setItem(ACCT_CACHE_KEY, JSON.stringify({ ...prev, ...patch, at: Date.now() }));
  } catch { /* private mode / quota — caching is best-effort */ }
}
function clearAccountCache() {
  try { sessionStorage.removeItem(ACCT_CACHE_KEY); } catch { /* ignore */ }
}

// ── Inline brand icons (stroke-based; `.icon` gives fill:none/stroke) ──
const IArrow = () => (<svg className="icon" viewBox="0 0 24 24"><path d="M4 12h15m-5-5 5 5-5 5" /></svg>);
const IChat = () => (<svg className="icon" viewBox="0 0 24 24"><path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z" /><path d="M7 10h10m-10 4h6" /></svg>);
const ICookie = () => (<svg className="icon" viewBox="0 0 32 32"><path d="M27 13a6 6 0 0 1-7-8 13 13 0 1 0 7 8Z" /><path d="m10 9 2 2-2 2-2-2Zm9 10 2 2-2 2-2-2Z" fill="currentColor" /><path d="m8 20 1 1m9-8 1 1m-4 10 1 1m8-9 1 1" strokeWidth={3} /></svg>);
const ICup = () => (<svg className="icon" viewBox="0 0 32 32"><path d="M7 12h18l-2 15H9L7 12ZM5 8h22v4H5zM9 8l1-4h12l1 4M12 17h8M13 21h6" /></svg>);
const IGift = () => (<svg className="icon" viewBox="0 0 32 32"><path d="M5 13h22v6H5zM7 19v9h18v-9M16 13v15M16 13C3 13 7 1 13 6l3 7Zm0 0C29 13 25 1 19 6l-3 7Z" /></svg>);
const ICrown = () => (<svg className="icon" viewBox="0 0 24 24"><path d="m3 6 4 4 5-6 5 6 4-4-2 12H5L3 6Zm3 15h12" /></svg>);
const IUser = () => (<svg className="icon" viewBox="0 0 24 24"><circle cx="12" cy="7" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3" /></svg>);
const IOverview = () => (<svg className="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></svg>);
const IOrders = () => (<svg className="icon" viewBox="0 0 24 24"><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm4 5h6m-6 4h6" /></svg>);
const IRepeat = () => (<svg className="icon" viewBox="0 0 24 24"><path d="m17 3 4 4-4 4M3 10V7h18M7 21l-4-4 4-4m14 1v3H3" /></svg>);
const IPin = () => (<svg className="icon" viewBox="0 0 24 24"><path d="M20 9c0 6-8 13-8 13S4 15 4 9a8 8 0 0 1 16 0Z" /><circle cx="12" cy="9" r="3" /></svg>);
const ICherry = () => (<svg className="icon" viewBox="0 0 24 24"><circle cx="7" cy="17" r="4" /><circle cx="17" cy="17" r="4" /><path d="M7 13 13 3l4 10M13 3q7-3 8 3-6 2-8-3Z" /></svg>);

function TbsCherry({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round((size * 30) / 26)} viewBox="0 0 26 30" aria-hidden="true">
      <path d="M12 14 C 12 9, 14 6, 17 4" stroke={TBS_GREEN} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M17 4 C 22 1, 25 4, 21 7 C 18 6, 18 6, 17 4 Z" fill="#4aa02c" />
      <circle cx="11" cy="20" r="8" fill="#b0201d" />
      <circle cx="8" cy="17" r="2" fill="#d76b62" />
    </svg>
  );
}

function fmtTbsDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function TbsRewards({ data, authToken }: { data: TbsData; authToken: string | null }) {
  const [receipts, setReceipts] = useState<TbsReceipt[]>(data.history.receipts);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const total = data.history.total;
  const p = data.points;

  const badgeFor = (status: string) =>
    status === "out_of_stock" ? { text: "out of stock", bg: "#FBECEA", fg: TBS_RED }
      : status === "discontinued" ? { text: "discontinued", bg: "#efefef", fg: "#666" }
        : null;

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      let t = authToken;
      try { t = (await getAccessToken()) || authToken; } catch { /* fall back to stored */ }
      if (!t) return;
      const r = await fetch(`/api/account/tbs?offset=${receipts.length}&limit=20`, { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
      const j = await r.json();
      const more: TbsReceipt[] = j?.found && Array.isArray(j?.history?.receipts) ? j.history.receipts : [];
      if (more.length) {
        setReceipts((prev) => {
          const seen = new Set(prev.map((x) => x.receiptNo).filter(Boolean));
          const fresh = more.filter((x) => !x.receiptNo || !seen.has(x.receiptNo));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      }
    } catch { /* ignore — TBS is optional */ } finally { setLoadingMore(false); }
  }

  return (
    <div style={{ borderRadius: 13, overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)", borderTop: `4px solid ${TBS_RED}`, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid #eee" }}>
        <TbsCherry size={26} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: TBS_GREEN, lineHeight: 1, letterSpacing: 0.5 }}>tbs</div>
          <div style={{ fontSize: 12, fontStyle: "italic", color: TBS_RED, marginTop: 1 }}>100% Fresh. Today and Always</div>
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ padding: "12px 14px", background: "#FBF4F3", border: "1px solid #f0dcda", borderRadius: 12 }}>
          <div style={{ fontSize: 12, color: TBS_GREEN }}>rupiah points</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: TBS_RED }}>{rpFmt(p.balance)}</div>
          <div style={{ fontSize: 12, color: "#5a5a5a", marginTop: 2 }}>
            {p.expiring?.length ? `${rpFmt(p.expiring[0].amount)} expiring ${fmtTbsDate(p.expiring[0].on)}` : "points expire 12 months after earning"}
            {data.member.tier ? <> · tier <b style={{ color: TBS_GREEN }}>{data.member.tier}</b></> : null}
          </div>
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, color: TBS_RED, textTransform: "uppercase", letterSpacing: 0.4, margin: "16px 0 2px" }}>purchase history</div>
        {receipts.map((r, idx) => {
          const key = `${idx}:${r.receiptNo || r.date || ""}`;
          const isOpen = !!open[key];
          return (
            <div key={key}>
              <div onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderTop: "1px solid rgba(0,0,0,0.08)", cursor: "pointer", fontSize: 13 }}>
                <div>
                  <div style={{ color: COLORS.black }}>{r.store} · {r.items.length} item{r.items.length === 1 ? "" : "s"}</div>
                  <div style={{ color: COLORS.muted, fontSize: 12 }}>{fmtTbsDate(r.date)}{r.pointsEarned ? ` · +${r.pointsEarned.toLocaleString("id-ID")} pts` : ""}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.black }}>{rpFmt(r.total)}<span style={{ color: "#999", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s", display: "inline-block" }}>›</span></div>
              </div>
              {isOpen ? (
                <div style={{ padding: "2px 0 8px 4px" }}>
                  {r.items.map((it, i) => {
                    const b = badgeFor(it.status);
                    const linkColor = it.status === "in_stock" ? TBS_GREEN : it.status === "out_of_stock" ? TBS_RED : "#8a8a8a";
                    return (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: 12.5, gap: 8 }}>
                        <span style={{ minWidth: 0 }}>
                          {it.url
                            ? <a href={it.url} target="_blank" rel="noreferrer" style={{ color: linkColor, textDecoration: "none" }}>{it.name} ×{it.qty} ↗</a>
                            : <span>{it.name} ×{it.qty}</span>}
                          {b ? <span style={{ fontSize: 10.5, padding: "1px 6px", borderRadius: 999, marginLeft: 6, background: b.bg, color: b.fg, whiteSpace: "nowrap" }}>{b.text}</span> : null}
                        </span>
                        <span style={{ color: COLORS.black }}>{rpFmt(it.amount)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}

        {receipts.length < total ? (
          <div style={{ textAlign: "center", marginTop: 12, borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 10 }}>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>showing {receipts.length} of {total} · past 12 months</div>
            <button onClick={loadMore} disabled={loadingMore} style={{ width: "100%", height: 34, border: "1px solid #e2c9c7", borderRadius: 8, background: "#fff", color: TBS_RED, fontSize: 13, fontWeight: 700, cursor: loadingMore ? "default" : "pointer" }}>{loadingMore ? "…" : "Load more"}</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// A password input with a show/hide eye toggle. Module scope so it isn't remounted
// per keystroke (which would drop focus and the caret).
function PwField({ value, onChange, placeholder, autoComplete }: { value: string; onChange: (v: string) => void; placeholder: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  const input: React.CSSProperties = { width: "100%", padding: "11px 44px 11px 13px", borderRadius: 10, border: "1px solid #d8dadf", fontSize: 13, background: "#fafaf7" };
  return (
    <div style={{ position: "relative" }}>
      <input style={input} type={show ? "text" : "password"} placeholder={placeholder} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} title={show ? "Hide password" : "Show password"}
        style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", padding: 6, cursor: "pointer", color: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center" }}>
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
        )}
      </button>
    </div>
  );
}

// Set / change the signed-in member's password (identity comes from the session,
// so a Google-only account can add a FIRST password here). Keeps the session alive
// after the change by swapping in the fresh token the API returns.
function PasswordCard({ hasPassword, getToken, onPasswordSet }: { hasPassword: boolean; getToken: () => Promise<string | null>; onPasswordSet: () => void }) {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (next.length < 6) { setErr("Password must be at least 6 characters."); return; }
    if (next !== confirm) { setErr("The two passwords don't match."); return; }
    setBusy(true);
    try {
      const t = await getToken();
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ password: next, ...(hasPassword ? { currentPassword: cur } : {}) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!j?.ok) { setErr(j?.error || "Couldn't update your password."); return; }
      if (j?.token) setMemberToken(j.token);
      setCur(""); setNext(""); setConfirm("");
      setDone(true); setOpen(false);
      onPasswordSet();
    } catch {
      setErr("Couldn't update your password. Please check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sub">
      <div className="sub-head">
        <div>
          <b>{hasPassword ? "Password" : "Set a password"}</b>
          <small>{hasPassword ? "Change the password you use to sign in with email." : "Add one so you can sign in with email + password — not just Google."}</small>
        </div>
        {!open ? (
          <button type="button" className="link-btn" onClick={() => { setOpen(true); setDone(false); }}>{hasPassword ? "Change →" : "Set →"}</button>
        ) : null}
      </div>
      {done ? <div className="good">✓ Password saved — you can now sign in with your email &amp; password.</div> : null}
      {open ? (
        <form onSubmit={submit} style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {hasPassword ? (
            <PwField placeholder="Current password" autoComplete="current-password" value={cur} onChange={(v) => { setCur(v); setDone(false); }} />
          ) : null}
          <PwField placeholder="New password (min 6 characters)" autoComplete="new-password" value={next} onChange={(v) => { setNext(v); setDone(false); }} />
          <PwField placeholder="Confirm new password" autoComplete="new-password" value={confirm} onChange={(v) => { setConfirm(v); setDone(false); }} />
          {err ? <div className="bad">{err}</div> : null}
          <button type="submit" className="primary" disabled={busy} style={{ justifyContent: "center" }}>{busy ? "…" : hasPassword ? "Update password" : "Set password"}</button>
        </form>
      ) : null}
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap');
#cd-dash{--blue:#0014a8;--ink:#182153;--muted:#7a7e95;--line:#e6e7ed;--cream:#faf8f1;background:var(--cream);color:var(--ink);font:13px 'DM Sans',sans-serif;min-height:100svh;-webkit-font-smoothing:antialiased}
#cd-dash *{box-sizing:border-box}
#cd-dash button,#cd-dash input,#cd-dash select{font:inherit}
#cd-dash button,#cd-dash a{cursor:pointer}
#cd-dash a{color:inherit;text-decoration:none}
#cd-dash button{color:inherit}
#cd-dash h1,#cd-dash h2,#cd-dash h3,#cd-dash p{margin:0}
#cd-dash .icon{fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;width:21px;height:21px;flex-shrink:0}
#cd-dash button:focus-visible,#cd-dash a:focus-visible,#cd-dash input:focus-visible,#cd-dash select:focus-visible{outline:3px solid #e4a652;outline-offset:3px}
#cd-dash header{height:76px;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 40px}
#cd-dash .brand-family{display:flex;align-items:center;gap:16px}
#cd-dash .logo img{height:66px;width:66px;display:block;object-fit:contain}
#cd-dash .brand-divider{height:28px;width:1px;background:#ffffff45}
#cd-dash .tbs-brand{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:700}
#cd-dash .tbs-badge{width:48px;height:48px}
#cd-dash .tbs-badge img{width:100%;height:100%;object-fit:contain}
#cd-dash .nav{display:flex;align-items:center;gap:26px;font-size:12px;font-weight:600}
#cd-dash .shop{display:flex;align-items:center;gap:12px;padding:12px 18px;border:1px solid #ffffff55;border-radius:30px}
#cd-dash .shop:hover{background:#ffffff16}
#cd-dash .shop .icon{width:16px;height:16px}
#cd-dash .shell{display:grid;grid-template-columns:210px minmax(0,1fr);min-height:calc(100svh - 76px)}
#cd-dash aside{border-right:1px solid var(--line);padding:26px 18px;display:flex;flex-direction:column;background:#fffdf8}
#cd-dash .profile{display:flex;align-items:center;gap:10px;padding:0 10px 22px}
#cd-dash .avatar{width:36px;height:36px;border-radius:50%;background:#e8ecff;display:grid;place-items:center;font-weight:700;color:var(--blue);flex-shrink:0}
#cd-dash .profile b{display:block;font-size:12px}
#cd-dash .profile small{display:block;font-size:10px;color:var(--muted);margin-top:3px;max-width:128px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#cd-dash .nav-label{font-size:9px;letter-spacing:1.7px;color:#9397aa;padding:0 12px;margin-bottom:10px}
#cd-dash .side-nav{display:grid;gap:5px}
#cd-dash .side-nav button{border:0;background:transparent;text-align:left;display:flex;align-items:center;gap:11px;padding:12px;border-radius:9px;font-size:12px;width:100%}
#cd-dash .side-nav button:hover{background:#f1f2fb}
#cd-dash .side-nav button.active{background:#e9edff;color:var(--blue);font-weight:700}
#cd-dash .side-bottom{margin-top:auto;padding:16px 12px 0;display:grid;gap:14px}
#cd-dash .side-bottom a,#cd-dash .side-bottom button{display:flex;align-items:center;gap:10px;border:0;background:transparent;color:var(--muted);font-size:11px;padding:0;text-align:left}
#cd-dash .canvas{padding:28px 32px 18px;min-width:0;display:flex;flex-direction:column}
#cd-dash .page-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px;gap:12px}
#cd-dash .canvas h1{font:600 30px 'Outfit',sans-serif;letter-spacing:-1px}
#cd-dash .subtitle{font-size:12px;color:var(--muted);margin-top:7px}
#cd-dash .head-right{display:flex;align-items:center;gap:10px;flex-shrink:0}
#cd-dash .tag{font-size:10px;padding:8px 11px;background:#fff;border:1px solid var(--line);border-radius:7px;color:var(--muted);white-space:nowrap}
#cd-dash .layout{display:grid;grid-template-columns:minmax(0,1fr) 272px;gap:20px}
#cd-dash .left{display:grid;gap:18px;align-content:start}
#cd-dash .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
#cd-dash .stat{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px}
#cd-dash .stat:first-child{background:#edf0ff;border-color:#dfe4ff}
#cd-dash .stat-top{display:flex;justify-content:space-between;color:var(--muted);font-size:10px}
#cd-dash .stat-top .icon{color:var(--blue);width:19px;height:19px}
#cd-dash .stat strong{display:block;font:600 30px 'Outfit',sans-serif;margin:8px 0 3px;letter-spacing:-1px}
#cd-dash .stat small{font-size:10px;color:var(--muted)}
#cd-dash .panel{background:#fff;border:1px solid var(--line);border-radius:13px;padding:20px}
#cd-dash .panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:10px}
#cd-dash .canvas h2{font:600 17px 'Outfit',sans-serif;letter-spacing:-.25px}
#cd-dash .canvas h3{font:600 14px 'Outfit',sans-serif}
#cd-dash .link-btn{border:0;background:transparent;font-size:11px;color:var(--blue);padding:0;font-weight:600}
#cd-dash .stamp-row{display:flex;justify-content:space-between;align-items:baseline;font-size:12px;margin-bottom:11px}
#cd-dash .stamp-row b{font-weight:700}
#cd-dash .stamp-row span{color:var(--muted);font-size:10px}
#cd-dash .stamps{display:flex;gap:7px;margin-bottom:12px;justify-content:space-between}
#cd-dash .stamp{flex:1 1 0;min-width:0;aspect-ratio:1;max-width:36px;border:1px dashed #d4d8e8;border-radius:50%;display:grid;place-items:center;color:#c0c6db;font-size:10px}
#cd-dash .stamp .icon{width:17px;height:17px}
#cd-dash .stamp.filled{background:#e9edff;border:1px solid #d3dbff;color:var(--blue)}
#cd-dash .reward-line{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;background:#f5f6ff;border-radius:7px;font-size:11px;color:var(--blue);margin-bottom:14px}
#cd-dash .reward-line button{font-size:11px;border:0;background:transparent;color:var(--blue);font-weight:700;white-space:nowrap}
#cd-dash .drinks{border-top:1px solid var(--line);padding-top:14px}
#cd-dash .footnote{font-size:10px;color:var(--muted);line-height:1.55;margin-top:4px}
#cd-dash .bottom-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
#cd-dash .mini{padding:16px;display:flex;align-items:flex-start;gap:12px}
#cd-dash .tile-icon{width:32px;height:32px;border-radius:9px;background:#fff2de;color:#9f6c21;display:grid;place-items:center;flex-shrink:0}
#cd-dash .tile-icon .icon{width:18px;height:18px}
#cd-dash .mini p{font-size:11px;color:var(--muted);line-height:1.5;margin:5px 0 9px}
#cd-dash .right{display:grid;align-content:start;gap:16px}
#cd-dash .member-card{background:var(--blue);color:#fff;border-radius:14px;padding:22px;position:relative;overflow:hidden;min-height:183px}
#cd-dash .member-card:after{content:'✧';position:absolute;right:-4px;bottom:-56px;font-size:180px;opacity:.12;line-height:1}
#cd-dash .card-label{font-size:9px;letter-spacing:1.7px}
#cd-dash .member-card h2{font:500 26px 'Outfit',sans-serif;margin:16px 0 5px;color:#fff}
#cd-dash .member-card p{color:#cbd1ff;font-size:10px}
#cd-dash .card-bottom{display:flex;justify-content:space-between;align-items:center;margin-top:22px;font-size:10px;position:relative;z-index:1;gap:8px}
#cd-dash .card-bottom span{font-family:monospace;letter-spacing:.5px}
#cd-dash .card-bottom button{border:1px solid #ffffff55;background:#ffffff18;border-radius:6px;color:#fff;font-size:10px;padding:7px 10px;white-space:nowrap}
#cd-dash .tier-top{display:flex;align-items:center;gap:10px;margin-bottom:12px}
#cd-dash .tier-icon{background:#f1f2f6;border-radius:50%;padding:9px;display:grid;place-items:center;color:var(--blue)}
#cd-dash .tier p{font-size:11px;line-height:1.6;color:var(--muted)}
#cd-dash .tier-note{margin-top:13px;padding-top:12px;border-top:1px solid var(--line);font-size:11px;color:var(--blue);line-height:1.5}
#cd-dash .points-brand{display:flex;gap:10px;align-items:center;font-size:12px;font-weight:700;color:var(--ink)}
#cd-dash .points-copy{font-size:11px;color:var(--muted);line-height:1.55;margin:10px 0}
#cd-dash .page-footer{display:flex;justify-content:space-between;color:#9699a9;font-size:9px;margin-top:auto;padding-top:17px}
#cd-dash .page-footer a{margin-left:16px}
#cd-dash .primary{background:var(--blue);color:#fff;border:0;border-radius:8px;padding:11px 17px;font-size:12px;display:inline-flex;align-items:center;gap:8px;font-weight:600}
#cd-dash .primary:hover{background:#071b8c}
#cd-dash .primary:disabled{opacity:.6;cursor:not-allowed}
#cd-dash .primary .icon{width:16px;height:16px}
#cd-dash .secondary{background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px 15px;font-size:12px;display:inline-flex;align-items:center;gap:8px;color:var(--ink)}
#cd-dash .detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}
#cd-dash .detail-grid p{color:var(--muted);font-size:12px;line-height:1.7;margin:14px 0}
#cd-dash .stackcol{display:grid;gap:20px;align-content:start}
#cd-dash .sample-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 0;border-bottom:1px solid var(--line);font-size:12px}
#cd-dash .sample-row:last-child{border-bottom:0}
#cd-dash .sample-row small{display:block;color:var(--muted);font-size:10px;margin-top:5px}
#cd-dash .field-label{font-size:11px;font-weight:600;display:block;margin:14px 0 6px;color:var(--ink)}
#cd-dash .ro{width:100%;padding:11px;border:1px solid var(--line);border-radius:8px;background:#fafaf7;color:var(--muted);font-size:12px}
#cd-dash .bselect{flex:1;min-width:0;padding:10px 11px;border-radius:8px;border:1px solid var(--line);font-size:13px;background:#fff;color:var(--ink)}
#cd-dash .good{font-size:11px;font-weight:700;color:#1d9e75;margin-top:10px}
#cd-dash .bad{font-size:12px;font-weight:700;color:#c0362c}
#cd-dash .sub{border-top:1px solid var(--line);margin-top:16px;padding-top:16px}
#cd-dash .sub-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
#cd-dash .sub-head b{font-size:13px}
#cd-dash .sub-head small{display:block;color:var(--muted);font-size:10px;margin-top:4px;line-height:1.5}
#cd-dash .logout-link{color:#c0362c!important}
#cd-dash .modal{position:fixed;inset:0;background:#10173788;z-index:50;display:grid;place-items:center;padding:20px}
#cd-dash .modal-box{background:var(--cream);width:340px;max-width:100%;border-radius:18px;padding:26px;text-align:center}
#cd-dash .modal-box h2{font:600 19px 'Outfit',sans-serif}
#cd-dash .modal-box p{font-size:12px;color:var(--muted);line-height:1.6;margin:10px 0 18px}
#cd-dash .qrbox{background:#fff;border-radius:14px;padding:14px;display:inline-block;margin:14px 0 8px;border:1px solid var(--line)}
#cd-dash .code{font-family:monospace;font-weight:800;letter-spacing:1px;color:var(--ink);font-size:15px}
#cd-dash .center-wrap{display:grid;place-items:center;min-height:calc(100svh - 76px);padding:24px}
#cd-dash .auth-card{width:100%;max-width:420px}
#cd-dash .auth-card .field-in{width:100%;padding:12px 14px;border-radius:10px;border:1px solid #d8dadf;font-size:14px;background:#fff}
#cd-dash .otp-in{letter-spacing:7px;text-align:center;font-size:20px;font-weight:800}
@media(max-width:1100px){#cd-dash .shell{grid-template-columns:186px 1fr}#cd-dash .layout{gap:14px;grid-template-columns:minmax(0,1fr) 238px}#cd-dash .nav{gap:16px}#cd-dash .nav>a:first-child{display:none}#cd-dash .canvas h1{font-size:27px}#cd-dash header{padding:0 28px}}
@media(max-width:850px){#cd-dash header{padding:0 20px}#cd-dash .nav>a:not(.shop){display:none}#cd-dash .shell{grid-template-columns:66px 1fr}#cd-dash aside{padding:18px 8px}#cd-dash .profile{padding:0 4px 18px;justify-content:center}#cd-dash .profile>div:last-child,#cd-dash .nav-label,#cd-dash .side-nav button span,#cd-dash .side-bottom .lbl{display:none}#cd-dash .side-nav button{justify-content:center;padding:12px}#cd-dash .side-bottom a,#cd-dash .side-bottom button{justify-content:center}#cd-dash .layout{grid-template-columns:1fr}#cd-dash .right{grid-template-columns:1fr 1fr}#cd-dash .detail-grid{grid-template-columns:1fr}#cd-dash .canvas{padding:22px}}
@media(max-width:560px){#cd-dash header{height:66px;padding:0 12px}#cd-dash .logo img{width:52px;height:52px}#cd-dash .brand-family{gap:8px}#cd-dash .tbs-badge{width:34px;height:34px}#cd-dash .tbs-brand{gap:6px;font-size:9px}#cd-dash .shop{font-size:10px;padding:9px 12px}#cd-dash .shop .icon{display:none}#cd-dash .shell{display:flex;flex-direction:column;min-height:calc(100svh - 66px)}#cd-dash aside{padding:5px;border-right:0;border-bottom:1px solid var(--line);flex-direction:row;align-items:center}#cd-dash .profile,#cd-dash .nav-label{display:none}#cd-dash .side-nav{display:flex;justify-content:space-around;gap:0;width:100%}#cd-dash .side-nav button{padding:8px;flex-direction:column;gap:3px}#cd-dash .side-nav button span{display:block;font-size:8px}#cd-dash .side-nav button .icon{width:19px;height:19px}#cd-dash .side-bottom{display:none}#cd-dash .canvas{padding:16px 14px;flex:1}#cd-dash .stats{grid-template-columns:1fr;gap:8px}#cd-dash .bottom-grid{grid-template-columns:1fr}#cd-dash .right{grid-template-columns:1fr}#cd-dash .canvas h1{font-size:23px}#cd-dash .page-head .tag{display:none}}
`;

type ViewId = "overview" | "rewards" | "orders" | "membership" | "referrals" | "settings";

export default function AccountPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<Member | null>(null);
  const [copied, setCopied] = useState(false);
  const [bdayMonth, setBdayMonth] = useState("");
  const [bdayDay, setBdayDay] = useState("");
  const [bdaySaved, setBdaySaved] = useState(false);
  const [bdayBusy, setBdayBusy] = useState(false);
  const [bdayErr, setBdayErr] = useState("");
  const [needsPhone, setNeedsPhone] = useState(false);
  const [phone, setPhone] = useState("");
  const [otpStep, setOtpStep] = useState<"phone" | "code">("phone");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [qr, setQr] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [email, setEmail] = useState("");
  const [tbs, setTbs] = useState<TbsData | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [view, setView] = useState<ViewId>("overview");
  const [cardOpen, setCardOpen] = useState(false);

  async function token() {
    return (await getAccessToken()) || null;
  }

  async function load(background = false) {
    if (!background) setLoading(true);
    setLoadErr("");
    try {
      const t = await token().catch(() => null);
      if (!t) { clearAccountCache(); router.replace("/account/login"); return; }
      let signedInEmail = "";
      try { signedInEmail = (await getSessionEmail()) || ""; setEmail(signedInEmail); } catch {}
      setAuthToken(t);
      fetch("/api/account/tbs", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" })
        .then((r) => r.json())
        .then((j) => { if (j?.configured && j?.found) { setTbs(j as TbsData); writeAccountCache({ tbs: j as TbsData }); } })
        .catch(() => { /* TBS is optional; never blocks the account page */ });
      const timeoutSignal = typeof AbortSignal !== "undefined" && (AbortSignal as any).timeout ? (AbortSignal as any).timeout(12000) : undefined;
      const res = await fetch("/api/account/me", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store", signal: timeoutSignal });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) { clearAccountCache(); router.replace("/account/login"); return; }
      if (typeof j?.hasPassword === "boolean") setHasPassword(j.hasPassword);
      if (j?.needsPhone) {
        setNeedsPhone(true);
        if (j?.phone) setPhone(j.phone);
        return;
      }
      if (j?.member) { setMember(j.member); writeAccountCache({ member: j.member, email: signedInEmail }); return; }
      if (!background) setLoadErr(j?.error || "We couldn't load your account. Please try again.");
    } catch {
      if (!background) setLoadErr("We couldn't load your account. Please check your connection and try again.");
    } finally {
      if (!background) setLoading(false);
    }
  }

  useEffect(() => {
    let hydrated = false;
    try {
      const c = JSON.parse(sessionStorage.getItem(ACCT_CACHE_KEY) || "null");
      if (c?.member && typeof c?.at === "number" && Date.now() - c.at < 30 * 60_000) {
        setMember(c.member as Member);
        if (c.email) setEmail(c.email);
        if (c.tbs) setTbs(c.tbs as TbsData);
        setLoading(false);
        hydrated = true;
      }
    } catch { /* ignore */ }
    load(hydrated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (member?.memberCode) {
      QRCode.toDataURL(member.memberCode, { margin: 1, width: 220 }).then(setQr).catch(() => setQr(""));
    }
  }, [member?.memberCode]);

  useEffect(() => {
    if (member?.birthday && /^\d{2}-\d{2}$/.test(member.birthday)) {
      const [m, d] = member.birthday.split("-");
      setBdayMonth(m);
      setBdayDay(d);
    }
  }, [member?.birthday]);

  async function saveBirthday() {
    if (!bdayMonth || !bdayDay) return;
    setBdayBusy(true);
    setBdaySaved(false);
    setBdayErr("");
    try {
      const t = await token();
      const res = await fetch("/api/account/birthday", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ birthday: `${bdayMonth}-${bdayDay}` }),
      });
      const j = await res.json().catch(() => ({}));
      if (j?.ok) {
        setBdaySaved(true);
        await load(true);
      } else {
        setBdayErr(j?.error || "Couldn't save your birthday. Please try again.");
      }
    } catch {
      setBdayErr("Couldn't save your birthday. Please check your connection.");
    } finally {
      setBdayBusy(false);
    }
  }

  async function sendPhoneCode(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setNote("");
    if (!canonicalPhone(phone)) { setErr("Enter a valid phone (08… or +628…)."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/account/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const j = await res.json().catch(() => ({}));
      if (!j?.ok) { setErr(j?.error || "Couldn't send the code."); return; }
      setOtpStep("code");
      setNote(`We sent a 6-digit code to ${phone} on WhatsApp.`);
    } finally {
      setBusy(false);
    }
  }

  async function verifyAndSave(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!/^\d{6}$/.test(code)) { setErr("Enter the 6-digit code."); return; }
    setBusy(true);
    try {
      const t = await token();
      const v = await fetch("/api/account/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ phone, code }),
      }).then((r) => r.json()).catch(() => ({ ok: false }));
      if (!v?.ok) { setErr(v?.error || "Incorrect code."); return; }

      const res = await fetch("/api/account/me", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ phone }),
      });
      const j = await res.json().catch(() => ({}));
      if (j?.member) { setMember(j.member); setNeedsPhone(false); setOtpStep("phone"); setCode(""); }
      else setErr(j?.error || "Could not save phone.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    clearAccountCache();
    try { await signOutMember(); } catch { /* ignore */ }
    try {
      Object.keys(localStorage).forEach((k) => {
        if (/sb-.*-auth-token/.test(k) || k.toLowerCase().includes("supabase")) localStorage.removeItem(k);
      });
    } catch { /* ignore */ }
    router.replace("/account/login");
  }

  // ── Shared chrome ──────────────────────────────────────────────────────────
  const Header = (
    <header>
      <div className="brand-family">
        <a className="logo" href="/" aria-label="Cookie Doh home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/login/cookie-doh-logo.png" alt="Cookie Doh" width={66} height={66} />
        </a>
        <span className="brand-divider" aria-hidden="true" />
        <a className="tbs-brand" href="https://totalbuahstore.com/" aria-label="Totalbuahstore.com home">
          <span className="tbs-badge">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/login/tbs-logo-5b14a4c2bae5.png" alt="TBS" width={48} height={43} />
          </span>
          <span>Totalbuahstore.com</span>
        </a>
      </div>
      <nav className="nav" aria-label="Main navigation">
        <a href="/">The cookie shop</a>
        <a href="/help">Need a hand?</a>
        <a className="shop" href="/cookies">Build your box <IArrow /></a>
      </nav>
    </header>
  );

  const PageFooter = (
    <div className="page-footer">
      <span>TBS × Cookie Doh · A little love. A lot of cookies.</span>
      <div><a href="/help">Help</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>
    </div>
  );

  if (loading) {
    return (
      <div id="cd-dash">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        {Header}
        <div className="center-wrap" style={{ color: "var(--muted)" }}>Loading your little corner…</div>
      </div>
    );
  }

  // Google users with no WhatsApp linked yet — onboarding step, in the dashboard shell.
  if (needsPhone) {
    return (
      <div id="cd-dash">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        {Header}
        <div className="center-wrap">
          <div className="panel auth-card">
            <h2 style={{ fontSize: 22 }}>{otpStep === "code" ? "Verify your number" : "Link your WhatsApp"}</h2>
            {email ? <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>Signed in as <b style={{ color: "var(--ink)" }}>{email}</b></div> : null}
            <p style={{ marginTop: 8, fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
              {otpStep === "code"
                ? (note || "Enter the code from WhatsApp.")
                : "This account doesn’t have a WhatsApp number linked yet — add it once to switch on your loyalty stamps & member QR. (Signing in with Google doesn’t collect a number, so this is the last step.)"}
            </p>
            {otpStep === "phone" ? (
              <form onSubmit={sendPhoneCode} style={{ marginTop: 16, display: "grid", gap: 10 }}>
                <input className="field-in" placeholder="Phone (08… or +628…)" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, ""))} />
                {err ? <div className="bad">{err}</div> : null}
                <button type="submit" className="primary" disabled={busy} style={{ justifyContent: "center", height: 46 }}>{busy ? "…" : "Send WhatsApp code"}</button>
              </form>
            ) : (
              <form onSubmit={verifyAndSave} style={{ marginTop: 16, display: "grid", gap: 10 }}>
                <input className="field-in otp-in" inputMode="numeric" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
                {err ? <div className="bad">{err}</div> : null}
                <button type="submit" className="primary" disabled={busy} style={{ justifyContent: "center", height: 46 }}>{busy ? "…" : "Verify & save"}</button>
                <button type="button" className="link-btn" onClick={() => { setOtpStep("phone"); setErr(""); setNote(""); setCode(""); }}>← Change number</button>
              </form>
            )}
            <PasswordCard hasPassword={hasPassword} getToken={token} onPasswordSet={() => setHasPassword(true)} />
            <button onClick={logout} className="link-btn logout-link" style={{ marginTop: 16 }}>Log out</button>
          </div>
        </div>
      </div>
    );
  }

  if (loadErr) {
    return (
      <div id="cd-dash">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        {Header}
        <div className="center-wrap">
          <div className="panel auth-card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 34 }}>😕</div>
            <h2 style={{ marginTop: 8 }}>Something went wrong</h2>
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>{loadErr}</p>
            <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
              <button onClick={() => load()} className="primary" style={{ justifyContent: "center", height: 46 }}>Try again</button>
              <button onClick={logout} className="secondary" style={{ justifyContent: "center", height: 44 }}>Log out &amp; start over</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!member) return null;

  const L = member.loyalty;
  const N = member.vip?.tier?.loyalty_per_free ?? 10; // VIPs earn faster (buy-9/8/7)
  const vip = member.vip;

  const origin = typeof window !== "undefined" ? window.location.origin : "https://www.cookiedoh.co.id";
  const referralUrl = `${origin}/?ref=${member.memberCode}`;
  const waText = `Get a FREE Cookie Doh cookie 🍪 Order your first box with my link and we both get one: ${referralUrl}`;
  const waShare = `https://wa.me/?text=${encodeURIComponent(waText)}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — the field is selectable as a fallback */ }
  };

  const TITLES: Record<ViewId, [string, string]> = {
    overview: [`Hey ${member.name || "there"}, life’s sweeter here.`, "Your treats, rewards, and a little something to look forward to."],
    rewards: ["Little stamps. Happy rewards.", "Every visit brings your next treat a little closer."],
    orders: ["Your cookie moments.", "Orders and regular deliveries, all in one place."],
    membership: ["You’re part of the family.", "Your membership, your perks, your fresh rewards."],
    referrals: ["Happiness is better shared.", "Invite a friend. Make someone’s day."],
    settings: ["Your account, your way.", "A few details that make your experience more personal."],
  };

  const stampCells = (kind: "cookie" | "cup", stamps: number) =>
    Array.from({ length: N }).map((_, i) => {
      const filled = i < stamps;
      const isLast = i === N - 1;
      return (
        <span key={i} className={filled ? "stamp filled" : "stamp"}>
          {filled ? (kind === "cookie" ? <ICookie /> : <ICup />) : isLast ? <IGift /> : i + 1}
        </span>
      );
    });

  const StampCollection = (
    <div className="panel">
      <div className="panel-head">
        <h2>Your stamp collection</h2>
        <a className="link-btn" href="/help">How it works ↗</a>
      </div>
      <div className="stamp-row"><b>Cookies</b><span>{L.cookieStamps} of {N} stamps</span></div>
      <div className="stamps">{stampCells("cookie", L.cookieStamps)}</div>
      {L.freeCookies > 0 ? (
        <div className="reward-line">
          <span>{L.freeCookies} free cookie{L.freeCookies > 1 ? "s" : ""} ready for you</span>
          <button onClick={() => setCardOpen(true)}>Redeem →</button>
        </div>
      ) : null}
      <div className="drinks">
        <div className="stamp-row"><b>Drinks</b><span>{L.drinkStamps} of {N} stamps</span></div>
        <div className="stamps">{stampCells("cup", L.drinkStamps)}</div>
        {L.freeDrinks > 0 ? (
          <div className="reward-line">
            <span>{L.freeDrinks} free drink{L.freeDrinks > 1 ? "s" : ""} ready for you</span>
            <button onClick={() => setCardOpen(true)}>Redeem →</button>
          </div>
        ) : null}
      </div>
      <p className="footnote">Every cookie &amp; drink you buy earns a stamp — singles, boxes, assortments &amp; bundles. Only redeemed free rewards don’t.</p>
    </div>
  );

  const MemberCardPanel = (
    <div className="member-card">
      <div className="card-label">TBS × COOKIE DOH FAMILY</div>
      <h2>Your daily dose<br />of happy.</h2>
      <p>{member.name || "Cookie Doh family"} · {vip?.tier ? `${vip.tier.name} member` : "Family member"}</p>
      <div className="card-bottom">
        <span>{member.memberCode}</span>
        <button onClick={() => setCardOpen(true)}>Show member card</button>
      </div>
    </div>
  );

  const VipPanel = (vip && (vip.tier || vip.next)) ? (
    <div className="panel tier">
      <div className="tier-top">
        <div className="tier-icon"><ICrown /></div>
        <div><h2>{vip.tier ? `${vip.tier.name} looks good on you.` : "Become a VIP."}</h2></div>
      </div>
      {vip.tier ? (
        <>
          <p>Your perks: {vipPerksLine(vip.tier)}.</p>
          <div className="tier-note">
            {vip.maintain_remaining_idr > 0
              ? `Spend ${rpFmt(vip.maintain_remaining_idr)} more this month to keep ${vip.tier.name}.`
              : `You’re keeping ${vip.tier.name} this month — nicely done 🎉`}
            {vip.next ? ` Spend ${rpFmt(vip.reach_remaining_idr)} more (last 12 months) to reach ${vip.next.name}.` : " You’re at the top tier. Enjoy every bite."}
          </div>
        </>
      ) : vip.next ? (
        <p>Spend {rpFmt(vip.reach_remaining_idr)} more (in the last 12 months) to reach <b>{vip.next.name}</b> and unlock {vipPerksLine(vip.next)}.</p>
      ) : null}
    </div>
  ) : null;

  // Third stat adapts to what the member has.
  const stat3 = tbs
    ? { label: "TBS reward points", value: Math.round(tbs.points.balance).toLocaleString("id-ID"), small: "A little extra, every shop", icon: <ICherry /> }
    : vip?.tier
      ? { label: "Membership", value: vip.tier.name, small: "Your current tier", icon: <ICrown /> }
      : { label: "Stamps earned", value: String(L.cookieStamps + L.drinkStamps), small: "Keep collecting", icon: <ICookie /> };

  const BirthdayPanel = (
    <div className="panel">
      <h2>🎂 Your birthday</h2>
      {member.birthday ? (
        <>
          <p style={{ margin: "10px 0 0" }}>Saved — we’ll surprise you with a free cookie every year 🍪</p>
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, padding: "10px 12px", borderRadius: 8, background: "#F4F2EE", fontWeight: 700, color: "var(--ink)", fontSize: 13 }}>
              {(() => { const [m, d] = member.birthday!.split("-"); return `${MONTHS[Number(m) - 1] || m} ${Number(d)}`; })()}
            </div>
            <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, whiteSpace: "nowrap" }}>🔒 Locked</span>
          </div>
          <p className="footnote" style={{ marginTop: 8 }}>Set once and can’t be changed. Message us if it needs fixing.</p>
        </>
      ) : (
        <>
          <p style={{ margin: "10px 0 0" }}>Add it once and we’ll surprise you with a free cookie every year 🍪 <b>You can only set this once</b>, so double-check the date.</p>
          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
            <select className="bselect" value={bdayMonth} onChange={(e) => { setBdayMonth(e.target.value); setBdaySaved(false); }}>
              <option value="">Month</option>
              {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
            </select>
            <select className="bselect" value={bdayDay} onChange={(e) => { setBdayDay(e.target.value); setBdaySaved(false); }}>
              <option value="">Day</option>
              {Array.from({ length: 31 }).map((_, i) => <option key={i} value={String(i + 1).padStart(2, "0")}>{i + 1}</option>)}
            </select>
            <button onClick={saveBirthday} disabled={bdayBusy || !bdayMonth || !bdayDay} className="primary" style={{ height: 40, flex: "0 0 auto", background: bdaySaved ? "#1d9e75" : undefined }}>
              {bdayBusy ? "…" : bdaySaved ? "Saved ✓" : "Save"}
            </button>
          </div>
          {bdayErr ? <div className="bad" style={{ marginTop: 8 }}>{bdayErr}</div> : null}
        </>
      )}
    </div>
  );

  const ReferPanel = (
    <div className="panel">
      <h2>Give a cookie. Get a cookie.</h2>
      <p>When a friend orders a box of 6 (or more) for the first time with your link, you <b>both</b> get a free cookie 🍪 A little joy, shared.</p>
      <label className="field-label" htmlFor="ref-link">Your referral link</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input id="ref-link" className="ro" readOnly value={referralUrl} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, minWidth: 0 }} />
        <button onClick={copyLink} className="secondary" style={{ flex: "0 0 auto", color: "var(--blue)", fontWeight: 700 }}>{copied ? "Copied!" : "Copy"}</button>
      </div>
      <a href={waShare} target="_blank" rel="noreferrer" style={{ marginTop: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", width: "100%", background: "#25D366", color: "#fff", fontWeight: 700, fontSize: 13, padding: "12px", borderRadius: 8 }}>
        Share on WhatsApp
      </a>
    </div>
  );

  const navItems: { id: ViewId; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <IOverview /> },
    { id: "rewards", label: "My rewards", icon: <ICookie /> },
    { id: "orders", label: "Orders & plans", icon: <IOrders /> },
    { id: "membership", label: "Membership", icon: <ICrown /> },
    { id: "referrals", label: "Refer a friend", icon: <IGift /> },
    { id: "settings", label: "Account settings", icon: <IUser /> },
  ];

  return (
    <div id="cd-dash">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {Header}
      <div className="shell">
        <aside>
          <div className="profile">
            <div className="avatar">{(member.name?.trim()?.[0] || "🍪").toUpperCase()}</div>
            <div>
              <b>{member.name || "there"}</b>
              <small>{email || "Cookie Doh family"}</small>
            </div>
          </div>
          <div className="nav-label">YOUR LITTLE CORNER</div>
          <nav className="side-nav" aria-label="Account sections">
            {navItems.map((n) => (
              <button key={n.id} className={view === n.id ? "active" : ""} aria-current={view === n.id ? "page" : undefined} onClick={() => setView(n.id)}>
                {n.icon}<span>{n.label}</span>
              </button>
            ))}
          </nav>
          <div className="side-bottom">
            <a href="/help"><IChat /><span className="lbl">Help &amp; support</span></a>
            <button onClick={logout}><IArrow /><span className="lbl">Log out</span></button>
          </div>
        </aside>

        <main className="canvas">
          <div className="page-head">
            <div>
              <h1>{TITLES[view][0]}</h1>
              <p className="subtitle">{TITLES[view][1]}</p>
            </div>
            <div className="head-right">
              <span className="tag" style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 170, whiteSpace: "nowrap" }}>{email}</span>
            </div>
          </div>

          {/* ── Overview ── */}
          {view === "overview" ? (
            <div className="layout">
              <div className="left">
                <div className="stats">
                  <div className="stat">
                    <div className="stat-top">Free cookies<ICookie /></div>
                    <strong>{L.freeCookies}</strong>
                    <small>{L.freeCookies > 0 ? "Ready for a happy bite" : `${Math.max(0, N - L.cookieStamps)} stamps to your next bite`}</small>
                  </div>
                  <div className="stat">
                    <div className="stat-top">Free drinks<ICup /></div>
                    <strong>{L.freeDrinks}</strong>
                    <small>{L.freeDrinks > 0 ? "Ready for a happy sip" : `${Math.max(0, N - L.drinkStamps)} stamps to your next sip`}</small>
                  </div>
                  <div className="stat">
                    <div className="stat-top">{stat3.label}{stat3.icon}</div>
                    <strong>{stat3.value}</strong>
                    <small>{stat3.small}</small>
                  </div>
                </div>
                {StampCollection}
                <div className="bottom-grid">
                  <div className="panel mini">
                    <div className="tile-icon"><IGift /></div>
                    <div>
                      <h3>Good things are for sharing.</h3>
                      <p>Give a cookie. Get a cookie.<br />Bring a friend into the family.</p>
                      <button className="link-btn" onClick={() => setView("referrals")}>Invite a friend →</button>
                    </div>
                  </div>
                  <div className="panel mini">
                    <div className="tile-icon"><IOrders /></div>
                    <div>
                      <h3>Your next cookie moment.</h3>
                      <p>Find your orders and manage<br />your regular little treats.</p>
                      <button className="link-btn" onClick={() => setView("orders")}>Orders &amp; subscriptions →</button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="right">
                {MemberCardPanel}
                {VipPanel}
                {tbs ? (
                  <div className="panel">
                    <div className="points-brand"><TbsCherry size={22} />Fresh finds. Extra rewards.</div>
                    <p className="points-copy">Your TotalBuahStore points and purchase history, together in one place.</p>
                    <button className="link-btn" onClick={() => setView("membership")}>Explore your TBS rewards →</button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* ── My rewards ── */}
          {view === "rewards" ? (
            <div className="detail-grid">
              {StampCollection}
              <div className="panel">
                <h2>A treat on us.</h2>
                {L.freeCookies > 0 || L.freeDrinks > 0 ? (
                  <p>You have {L.freeCookies > 0 ? <b>{L.freeCookies} free cookie{L.freeCookies > 1 ? "s" : ""}</b> : null}{L.freeCookies > 0 && L.freeDrinks > 0 ? " and " : null}{L.freeDrinks > 0 ? <b>{L.freeDrinks} free drink{L.freeDrinks > 1 ? "s" : ""}</b> : null} ready. Show your member card at the counter to redeem.</p>
                ) : (
                  <p>Keep collecting — {Math.max(0, N - L.cookieStamps)} more cookie stamp{N - L.cookieStamps === 1 ? "" : "s"} and {Math.max(0, N - L.drinkStamps)} more drink stamp{N - L.drinkStamps === 1 ? "" : "s"} to your next free ones.</p>
                )}
                <button className="primary" onClick={() => setCardOpen(true)}>Show member card</button>
                <div className="sample-row" style={{ marginTop: 16 }}>
                  <span>Birthday cookie<small>A little birthday surprise, every year.</small></span>
                  <IGift />
                </div>
              </div>
            </div>
          ) : null}

          {/* ── Orders & plans ── */}
          {view === "orders" ? (
            <div className="detail-grid">
              <div className="panel">
                <h2>Your orders</h2>
                <p>Revisit the little things that made your day, and keep an eye on what’s on its way.</p>
                <Link className="primary" href="/account/orders">View your orders →</Link>
                <div className="sample-row" style={{ marginTop: 16 }}>
                  <span>Delivery addresses<small>Keep your favourite delivery spots handy.</small></span>
                  <Link className="link-btn" href="/account/addresses">Manage →</Link>
                </div>
              </div>
              <div className="panel">
                <h2>Cookies on repeat.</h2>
                <p>A regular delivery of your favourites. Choose a box of 3 or 6, weekly, fortnightly or monthly — pause or change any time.</p>
                <Link className="primary" href="/account/subscription"><IRepeat />Manage subscription →</Link>
              </div>
            </div>
          ) : null}

          {/* ── Membership ── */}
          {view === "membership" ? (
            <div className="stackcol">
              {VipPanel ?? (
                <div className="panel"><h2>You’re part of the family.</h2><p>Every eligible cookie or drink earns a stamp toward a free one. Keep visiting to unlock VIP perks.</p></div>
              )}
              {tbs ? (
                <TbsRewards data={tbs} authToken={authToken} />
              ) : (
                <div className="panel">
                  <div className="points-brand"><TbsCherry size={22} />Totalbuahstore.com rewards</div>
                  <p className="points-copy">Shop at TotalBuahStore with your family number and your points &amp; purchase history will appear here.</p>
                </div>
              )}
            </div>
          ) : null}

          {/* ── Refer a friend ── */}
          {view === "referrals" ? (
            <div className="detail-grid">
              {ReferPanel}
              <div className="panel" style={{ display: "grid", placeItems: "center", textAlign: "center", minHeight: 180 }}>
                <div>
                  <div style={{ color: "var(--blue)", marginBottom: 12 }}><IGift /></div>
                  <h2>Great cookies. Great company.</h2>
                  <p>Invite someone who deserves a little treat. Share your link and you both get a free cookie on their first box of 6.</p>
                </div>
              </div>
            </div>
          ) : null}

          {/* ── Account settings ── */}
          {view === "settings" ? (
            <div className="detail-grid">
              <div className="panel">
                <h2>Your details</h2>
                <label className="field-label">Name</label>
                <div className="ro">{member.name || "—"}</div>
                <label className="field-label">Email</label>
                <div className="ro">{email || "—"}</div>
                <label className="field-label">WhatsApp</label>
                <div className="ro">{member.phone}</div>
                <div className="sample-row" style={{ marginTop: 14 }}>
                  <span>Delivery addresses<small>Keep your favourite delivery spots handy.</small></span>
                  <Link className="link-btn" href="/account/addresses">Manage →</Link>
                </div>
                <div style={{ marginTop: 16 }}>
                  <button onClick={logout} className="secondary" style={{ color: "#c0362c" }}>Log out</button>
                </div>
              </div>
              <div className="stackcol">
                {BirthdayPanel}
                <div className="panel">
                  <h2>Account security</h2>
                  <PasswordCard hasPassword={hasPassword} getToken={token} onPasswordSet={() => setHasPassword(true)} />
                </div>
              </div>
            </div>
          ) : null}

          {PageFooter}
        </main>
      </div>

      {cardOpen ? (
        <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) setCardOpen(false); }}>
          <section className="modal-box" role="dialog" aria-modal="true" aria-label="Your member card">
            <h2>Your member card</h2>
            <div className="qrbox">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="Membership QR" width={168} height={168} style={{ display: "block" }} />
              ) : <div style={{ width: 168, height: 168 }} />}
            </div>
            <div className="code">{member.memberCode}</div>
            <p>{member.name || "Cookie Doh family"} · {member.phone}<br />Show this at the counter to earn &amp; redeem.</p>
            <button className="primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => setCardOpen(false)}>Done</button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
