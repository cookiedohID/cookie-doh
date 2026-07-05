"use client";

// web/app/account/page.tsx
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { COLORS } from "@/lib/theme";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
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
// Its own brand identity (red + green + cherry logo + tagline) but the Cookie Doh
// app font, per the owner's call. Only rendered when the proxy returns found data.
const TBS_RED = "#9c1216";
const TBS_GREEN = "#135232";

type TbsItem = { sku: string; name: string; qty: number; amount: number; url: string; status: "in_stock" | "out_of_stock" | "discontinued" };
type TbsReceipt = { date: string; store: string; receiptNo: string; total: number; pointsEarned: number; items: TbsItem[] };
type TbsData = {
  member: { name: string | null; tier: string | null; memberSince: string | null };
  points: { balance: number; expiryMonths: number | null; expiring: { amount: number; on: string }[] };
  history: { total: number; offset: number; receipts: TbsReceipt[] };
};

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
      // Use a FRESH token — the one captured at page load may have expired on a long-open tab.
      let t = authToken;
      try { const { data } = await getSupabaseBrowser().auth.getSession(); t = data.session?.access_token || authToken; } catch { /* fall back to stored */ }
      if (!t) return;
      const r = await fetch(`/api/account/tbs?offset=${receipts.length}&limit=20`, { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
      const j = await r.json();
      const more: TbsReceipt[] = j?.found && Array.isArray(j?.history?.receipts) ? j.history.receipts : [];
      if (more.length) {
        // De-dupe by receiptNo so an overlapping page can't double-list a receipt (and stop growing when nothing new).
        setReceipts((prev) => {
          const seen = new Set(prev.map((x) => x.receiptNo).filter(Boolean));
          const fresh = more.filter((x) => !x.receiptNo || !seen.has(x.receiptNo));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      }
    } catch { /* ignore — TBS is optional */ } finally { setLoadingMore(false); }
  }

  return (
    <div style={{ marginTop: 18, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)", borderTop: `4px solid ${TBS_RED}`, background: "#fff" }}>
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
          // Composite, position-stable key — receipts only ever append, and receiptNo
          // may be blank, so index-qualify it to guarantee uniqueness.
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

  async function token() {
    const { data } = await getSupabaseBrowser().auth.getSession();
    return data.session?.access_token || null;
  }

  async function load() {
    setLoading(true);
    setLoadErr("");
    try {
      const t = await token().catch(() => null);
      if (!t) { router.replace("/account/login"); return; }
      // Capture the signed-in identity so the UI can always show WHICH account.
      try { const { data } = await getSupabaseBrowser().auth.getSession(); setEmail(data.session?.user?.email || ""); } catch {}
      // TotalBuahStore rewards — federated, feature-flagged server-side. Best-effort,
      // non-blocking; only surfaces when the proxy is configured AND finds the member.
      setAuthToken(t);
      fetch("/api/account/tbs", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" })
        .then((r) => r.json())
        .then((j) => { if (j?.configured && j?.found) setTbs(j as TbsData); })
        .catch(() => { /* TBS is optional; never blocks the account page */ });
      const timeoutSignal = typeof AbortSignal !== "undefined" && (AbortSignal as any).timeout ? (AbortSignal as any).timeout(12000) : undefined;
      const res = await fetch("/api/account/me", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store", signal: timeoutSignal });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) { router.replace("/account/login"); return; }
      if (j?.needsPhone) {
        setNeedsPhone(true);
        if (j?.phone) setPhone(j.phone); // re-verify an existing-but-unverified number
        return;
      }
      if (j?.member) { setMember(j.member); return; }
      // Neither member nor needsPhone (e.g. backend error, or a phone linked to
      // another account) — surface it instead of rendering a blank page.
      setLoadErr(j?.error || "We couldn't load your account. Please try again.");
    } catch {
      setLoadErr("We couldn't load your account. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render the membership QR whenever we have a member code.
  useEffect(() => {
    if (member?.memberCode) {
      QRCode.toDataURL(member.memberCode, { margin: 1, width: 220 }).then(setQr).catch(() => setQr(""));
    }
  }, [member?.memberCode]);

  // Prefill the birthday pickers from the saved value.
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
        await load(); // refresh so the section flips to the locked view
      } else {
        setBdayErr(j?.error || "Couldn't save your birthday. Please try again.");
      }
    } catch {
      setBdayErr("Couldn't save your birthday. Please check your connection.");
    } finally {
      setBdayBusy(false);
    }
  }

  // Step 1: send a WhatsApp OTP to the entered phone.
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

  // Step 2: verify the code (bound to this signed-in user), then link the phone.
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
    try { await signOutMember(); } catch { /* ignore */ }
    // Belt-and-suspenders: nuke any lingering Supabase auth token so a broken
    // session can never keep you stuck on this page.
    try {
      Object.keys(localStorage).forEach((k) => {
        if (/sb-.*-auth-token/.test(k) || k.toLowerCase().includes("supabase")) localStorage.removeItem(k);
      });
    } catch { /* ignore */ }
    router.replace("/account/login");
  }

  const field: React.CSSProperties = { width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.18)", fontSize: 15 };

  if (loading) {
    return <main style={{ minHeight: "100vh", background: COLORS.bg, display: "grid", placeItems: "center", color: COLORS.muted }}>Loading…</main>;
  }

  if (needsPhone) {
    return (
      <main style={{ minHeight: "100vh", background: COLORS.bg }}>
        <div style={{ maxWidth: 420, margin: "0 auto", padding: "40px 16px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: COLORS.black }}>{otpStep === "code" ? "Verify your number" : "Link your WhatsApp"}</h1>
          {email ? (
            <div style={{ marginTop: 6, marginBottom: 4, fontSize: 13, color: COLORS.muted }}>
              Signed in as <b style={{ color: COLORS.black }}>{email}</b>
            </div>
          ) : null}
          <p style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.55 }}>
            {otpStep === "code"
              ? (note || "Enter the code from WhatsApp.")
              : "This account doesn’t have a WhatsApp number linked yet — add it once to switch on your loyalty stamps & member QR. (Signing in with Google doesn’t collect a number, so this is the last step.)"}
          </p>
          {otpStep === "phone" ? (
            <form onSubmit={sendPhoneCode} style={{ marginTop: 16, display: "grid", gap: 10 }}>
              <input style={field} placeholder="Phone (08… or +628…)" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, ""))} />
              {err ? <div style={{ color: "crimson", fontSize: 13, fontWeight: 700 }}>{err}</div> : null}
              <button type="submit" disabled={busy} style={{ height: 48, borderRadius: 999, border: "none", background: COLORS.blue, color: "#fff", fontWeight: 900, cursor: "pointer" }}>{busy ? "…" : "Send WhatsApp code"}</button>
            </form>
          ) : (
            <form onSubmit={verifyAndSave} style={{ marginTop: 16, display: "grid", gap: 10 }}>
              <input style={{ ...field, letterSpacing: 6, textAlign: "center", fontSize: 22, fontWeight: 800 }} inputMode="numeric" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
              {err ? <div style={{ color: "crimson", fontSize: 13, fontWeight: 700 }}>{err}</div> : null}
              <button type="submit" disabled={busy} style={{ height: 48, borderRadius: 999, border: "none", background: COLORS.blue, color: "#fff", fontWeight: 900, cursor: "pointer" }}>{busy ? "…" : "Verify & save"}</button>
              <button type="button" onClick={() => { setOtpStep("phone"); setErr(""); setNote(""); setCode(""); }} style={{ border: "none", background: "none", color: COLORS.muted, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>← Change number</button>
            </form>
          )}
          <button onClick={logout} style={{ marginTop: 14, border: "none", background: "none", color: COLORS.muted, fontWeight: 700, cursor: "pointer" }}>Log out</button>
        </div>
      </main>
    );
  }

  if (loadErr) {
    return (
      <main style={{ minHeight: "100vh", background: COLORS.bg }}>
        <div style={{ maxWidth: 420, margin: "0 auto", padding: "60px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 36 }}>😕</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.black, marginTop: 8 }}>Something went wrong</h1>
          <p style={{ color: COLORS.muted, fontSize: 14, marginTop: 6 }}>{loadErr}</p>
          <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
            <button onClick={load} style={{ height: 48, borderRadius: 999, border: "none", background: COLORS.blue, color: "#fff", fontWeight: 900, cursor: "pointer" }}>Try again</button>
            <button onClick={logout} style={{ height: 46, borderRadius: 999, border: `1px solid ${COLORS.blue}`, background: "#fff", color: COLORS.blue, fontWeight: 900, cursor: "pointer" }}>Log out &amp; start over</button>
          </div>
          <p style={{ color: COLORS.muted, fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>Still stuck? Tap “Log out &amp; start over”, then sign in again.</p>
        </div>
      </main>
    );
  }

  if (!member) return null;

  const L = member.loyalty;
  const N = member.vip?.tier?.loyalty_per_free ?? 10; // VIPs earn faster (buy-9/8/7)
  const vip = member.vip;
  const cards = [
    { label: "🍪 Cookies", stamps: L.cookieStamps, free: L.freeCookies },
    { label: "🥤 Drinks", stamps: L.drinkStamps, free: L.freeDrinks },
  ];

  const origin = typeof window !== "undefined" ? window.location.origin : "https://www.cookiedoh.co.id";
  const referralUrl = `${origin}/?ref=${member.memberCode}`;
  const waText = `Get a FREE Cookie Doh cookie 🍪 Order your first box with my link and we both get one: ${referralUrl}`;
  const waShare = `https://wa.me/?text=${encodeURIComponent(waText)}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "32px 16px 80px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <span className="font-dearjoe" style={{ fontSize: 20, color: COLORS.blue }}>family</span>
            <h1 style={{ margin: "2px 0 0", fontSize: 26, fontWeight: 800, color: COLORS.black }}>Hi {member.name || "there"} 👋</h1>
            {email ? <div style={{ marginTop: 2, fontSize: 12.5, color: COLORS.muted }}>Signed in as {email}</div> : null}
          </div>
          <button onClick={logout} style={{ border: "none", background: "none", color: COLORS.muted, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Log out</button>
        </div>

        {/* sticky section menu — jump anywhere without scrolling the long page */}
        <div style={{ position: "sticky", top: 8, zIndex: 30, marginTop: 12 }}>
          <details id="famMenu" style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.10)", borderRadius: 12, boxShadow: "0 6px 18px rgba(0,0,0,0.08)" }}>
            <summary style={{ listStyle: "none", cursor: "pointer", padding: "10px 14px", fontWeight: 900, fontSize: 14, color: COLORS.blue }}>☰ Family menu</summary>
            <div style={{ padding: "2px 8px 10px", display: "grid" }}>
              {([
                ["🧾 My Orders & tracking", "/account/orders", ""],
                ["💳 Membership card", "", "sec-card"],
                ["👑 VIP status", "", "sec-vip"],
                ["🍪 Stamps & rewards", "", "sec-stamps"],
                ["🍒 TBS points & receipts", "", "sec-tbs"],
                ["🎂 Birthday", "", "sec-birthday"],
                ["📍 My addresses", "/account/addresses", ""],
                ["📦 My subscription", "/account/subscription", ""],
              ] as [string, string, string][]).map(([label, href, anchor]) => (
                href ? (
                  <Link key={label} href={href} style={{ padding: "9px 10px", borderRadius: 8, textDecoration: "none", color: COLORS.black, fontWeight: 700, fontSize: 13.5 }}>{label}</Link>
                ) : (
                  <button key={label} onClick={() => {
                    document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    (document.getElementById("famMenu") as any)?.removeAttribute("open");
                  }} style={{ textAlign: "left", border: "none", background: "none", padding: "9px 10px", borderRadius: 8, color: COLORS.black, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>{label}</button>
                )
              ))}
            </div>
          </details>
        </div>

        {/* Membership card / QR */}
        <div id="sec-card" style={{ marginTop: 18, borderRadius: 20, background: COLORS.blue, color: "#fff", padding: 20, display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 8, flex: "0 0 auto" }}>
            {qr ? <img src={qr} alt="Membership QR" width={110} height={110} style={{ display: "block" }} /> : <div style={{ width: 110, height: 110 }} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>TBS × Cookie Doh Family</div>
            <div style={{ opacity: 0.9, fontSize: 13, marginTop: 4 }}>{member.phone}</div>
            <div style={{ marginTop: 8, fontFamily: "monospace", fontWeight: 800, letterSpacing: 1 }}>{member.memberCode}</div>
            <div style={{ opacity: 0.85, fontSize: 12, marginTop: 8 }}>Show this at the counter to earn & redeem.</div>
          </div>
        </div>

        {/* One membership, both brands: quick balances strip under the card */}
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: tbs ? "1fr 1fr 1fr" : "1fr 1fr", gap: 8 }}>
          <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700 }}>🍪 Free cookies</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.blue }}>{L.freeCookies}</div>
          </div>
          <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700 }}>🥤 Free drinks</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.blue }}>{L.freeDrinks}</div>
          </div>
          {tbs ? (
            <div style={{ background: "#fff", border: "1px solid rgba(19,82,50,0.35)", borderRadius: 14, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#135232", fontWeight: 800 }}>🍒 TBS points{tbs.member.tier ? ` · ${tbs.member.tier}` : ""}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#135232" }}>{Math.round(tbs.points.balance).toLocaleString("id-ID")}</div>
            </div>
          ) : null}
        </div>

        {/* 👑 VIP status — only shown when a VIP program is running (tiers active) */}
        {vip && (vip.tier || vip.next) ? (
          <div id="sec-vip" style={{ marginTop: 14, borderRadius: 18, padding: 16, border: "1px solid rgba(176,141,30,0.45)", background: "linear-gradient(135deg, #FFF8E6, #FDEFC7)" }}>
            {vip.tier ? (
              <>
                <div style={{ fontWeight: 900, color: "#7a5c00", fontSize: 16 }}>👑 {vip.tier.name} member</div>
                <div style={{ fontSize: 13, color: "#6b5200", marginTop: 4 }}>Your perks: {vipPerksLine(vip.tier)}.</div>
                {vip.maintain_remaining_idr > 0 ? (
                  <div style={{ fontSize: 13, color: "#8a5a00", marginTop: 8, fontWeight: 700 }}>Spend {rpFmt(vip.maintain_remaining_idr)} more this month to keep {vip.tier.name}.</div>
                ) : (
                  <div style={{ fontSize: 12.5, color: "#6b5200", marginTop: 8 }}>You&apos;re keeping {vip.tier.name} this month — nicely done 🎉</div>
                )}
                {vip.next ? (
                  <div style={{ fontSize: 12.5, color: "#6b5200", marginTop: 4 }}>Spend {rpFmt(vip.reach_remaining_idr)} more (last 12 months) to reach {vip.next.name}.</div>
                ) : (
                  <div style={{ fontSize: 12.5, color: "#6b5200", marginTop: 4 }}>You&apos;re at the top tier ✨</div>
                )}
              </>
            ) : vip.next ? (
              <>
                <div style={{ fontWeight: 900, color: "#7a5c00", fontSize: 15 }}>👑 Become a VIP</div>
                <div style={{ fontSize: 13, color: "#6b5200", marginTop: 4 }}>
                  Spend {rpFmt(vip.reach_remaining_idr)} more (in the last 12 months) to reach <b>{vip.next.name}</b> and unlock {vipPerksLine(vip.next)}.
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {/* Loyalty progress */}
        <div id="sec-stamps" style={{ marginTop: 18, display: "grid", gap: 12 }}>
          {cards.map((c) => (
            <div key={c.label} style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontWeight: 800, color: COLORS.black }}>{c.label}</span>
                <span style={{ fontSize: 13, color: COLORS.muted }}>{c.stamps}/{N}</span>
              </div>
              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: `repeat(${N}, 1fr)`, gap: 5 }}>
                {Array.from({ length: N }).map((_, i) => (
                  <div key={i} style={{ height: 12, borderRadius: 6, background: i < c.stamps ? COLORS.blue : "rgba(0,0,0,0.10)" }} />
                ))}
              </div>
              {c.free > 0 ? (
                <div style={{ marginTop: 10, fontWeight: 800, color: "#0014A7" }}>🎁 {c.free} free {c.label.includes("Cookies") ? "cookie" : "drink"}{c.free > 1 ? "s" : ""} ready!</div>
              ) : (
                <div style={{ marginTop: 10, fontSize: 13, color: COLORS.muted }}>{N - c.stamps} more to your next free one</div>
              )}
            </div>
          ))}
        </div>

        <p style={{ marginTop: 12, fontSize: 12, color: COLORS.muted, lineHeight: 1.5, textAlign: "center" }}>
          Every cookie &amp; drink you buy earns a stamp — singles, boxes, assortments &amp; bundles. Only redeemed free rewards don&apos;t.
        </p>

        {/* TotalBuahStore rewards — only appears when the TBS proxy is configured + finds the member */}
        <div id="sec-tbs" />
        {tbs ? <TbsRewards data={tbs} authToken={authToken} /> : null}

        {/* Birthday — set once, then locked (so it can't be edited to farm the reward) */}
        <div style={{ marginTop: 18, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16 }}>
          <div id="sec-birthday" style={{ fontWeight: 800, color: COLORS.black, fontSize: 16 }}>🎂 Your birthday</div>
          {member.birthday ? (
            <>
              <div style={{ marginTop: 4, fontSize: 13, color: COLORS.muted, lineHeight: 1.5 }}>
                Saved — we'll surprise you with a free cookie every year 🍪
              </div>
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "#F4F2EE", fontWeight: 800, color: COLORS.black }}>
                  {(() => { const [m, d] = member.birthday!.split("-"); return `${MONTHS[Number(m) - 1] || m} ${Number(d)}`; })()}
                </div>
                <span style={{ fontSize: 12, color: COLORS.muted, fontWeight: 700, whiteSpace: "nowrap" }}>🔒 Locked</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: COLORS.muted }}>Set once and can't be changed. Message us if it needs fixing.</div>
            </>
          ) : (
            <>
              <div style={{ marginTop: 4, fontSize: 13, color: COLORS.muted, lineHeight: 1.5 }}>Add it once and we'll surprise you with a free cookie every year 🍪 <b>You can only set this once</b>, so double-check the date.</div>
              <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <select value={bdayMonth} onChange={(e) => { setBdayMonth(e.target.value); setBdaySaved(false); }} style={{ flex: 1, minWidth: 0, padding: "10px 11px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.18)", fontSize: 14, background: "#fff" }}>
                  <option value="">Month</option>
                  {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
                </select>
                <select value={bdayDay} onChange={(e) => { setBdayDay(e.target.value); setBdaySaved(false); }} style={{ flex: 1, minWidth: 0, padding: "10px 11px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.18)", fontSize: 14, background: "#fff" }}>
                  <option value="">Day</option>
                  {Array.from({ length: 31 }).map((_, i) => <option key={i} value={String(i + 1).padStart(2, "0")}>{i + 1}</option>)}
                </select>
                <button onClick={saveBirthday} disabled={bdayBusy || !bdayMonth || !bdayDay} style={{ border: "none", background: bdaySaved ? "#1d9e75" : COLORS.blue, color: "#fff", borderRadius: 10, padding: "0 16px", fontWeight: 800, fontSize: 13, cursor: bdayBusy || !bdayMonth || !bdayDay ? "not-allowed" : "pointer", height: 40, flex: "0 0 auto" }}>
                  {bdayBusy ? "…" : bdaySaved ? "Saved ✓" : "Save"}
                </button>
              </div>
              {bdayErr ? <div style={{ marginTop: 8, fontSize: 13, color: "crimson", fontWeight: 700 }}>{bdayErr}</div> : null}
            </>
          )}
        </div>

        {/* Refer a friend */}
        <div style={{ marginTop: 18, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16 }}>
          <div style={{ fontWeight: 800, color: COLORS.black, fontSize: 16 }}>🎁 Refer a friend</div>
          <div style={{ marginTop: 4, fontSize: 13, color: COLORS.muted, lineHeight: 1.5 }}>
            Give a cookie, get a cookie. When a friend orders a box of 6 (or more) for the first time with your link, you <b>both</b> get a free cookie 🍪
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <input
              readOnly
              value={referralUrl}
              onFocus={(e) => e.currentTarget.select()}
              style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", fontSize: 12, color: COLORS.black, background: COLORS.bg }}
            />
            <button onClick={copyLink} style={{ border: "1px solid rgba(0,0,0,0.15)", background: "#fff", borderRadius: 10, padding: "0 14px", fontWeight: 800, fontSize: 13, color: COLORS.blue, cursor: "pointer", flex: "0 0 auto" }}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <a href={waShare} target="_blank" rel="noreferrer" style={{ marginTop: 10, display: "block", textAlign: "center", background: "#25D366", color: "#fff", fontWeight: 800, fontSize: 14, padding: "12px", borderRadius: 999, textDecoration: "none" }}>
            Share on WhatsApp
          </a>
        </div>

        {/* Account hub links */}
        <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
          {[
            { href: "/account/orders", label: "🧾 My Orders", hint: "Your cafe & online purchases" },
            { href: "/account/subscription", label: "🔁 My Subscription", hint: "Skip, pause, edit or renew your boxes" },
            { href: "/account/addresses", label: "📍 Saved Addresses", hint: "For faster checkout" },
          ].map((l) => (
            <Link key={l.href} href={l.href} style={{ textDecoration: "none" }}>
              <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 800, color: COLORS.black }}>{l.label}</div>
                  <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{l.hint}</div>
                </div>
                <span style={{ color: COLORS.blue, fontWeight: 900, fontSize: 20 }}>›</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
