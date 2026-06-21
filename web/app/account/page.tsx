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

type Member = {
  name: string | null;
  phone: string;
  memberCode: string;
  birthday: string | null;
  loyalty: { cookieStamps: number; drinkStamps: number; freeCookies: number; freeDrinks: number };
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function AccountPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<Member | null>(null);
  const [copied, setCopied] = useState(false);
  const [bdayMonth, setBdayMonth] = useState("");
  const [bdayDay, setBdayDay] = useState("");
  const [bdaySaved, setBdaySaved] = useState(false);
  const [bdayBusy, setBdayBusy] = useState(false);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [phone, setPhone] = useState("");
  const [otpStep, setOtpStep] = useState<"phone" | "code">("phone");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [qr, setQr] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loadErr, setLoadErr] = useState("");

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
    try {
      const t = await token();
      const res = await fetch("/api/account/birthday", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ birthday: `${bdayMonth}-${bdayDay}` }),
      });
      const j = await res.json().catch(() => ({}));
      if (j?.ok) setBdaySaved(true);
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
          <p style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.55 }}>
            {otpStep === "code"
              ? (note || "Enter the code from WhatsApp.")
              : "Your loyalty stamps and member QR are tied to your WhatsApp number — add it once to activate. Signed in with Google? Your number isn’t collected at sign-in, so this is the only step left."}
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
            <span className="font-dearjoe" style={{ fontSize: 20, color: COLORS.blue }}>member</span>
            <h1 style={{ margin: "2px 0 0", fontSize: 26, fontWeight: 800, color: COLORS.black }}>Hi {member.name || "there"} 👋</h1>
          </div>
          <button onClick={logout} style={{ border: "none", background: "none", color: COLORS.muted, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Log out</button>
        </div>

        {/* Membership card / QR */}
        <div style={{ marginTop: 18, borderRadius: 20, background: COLORS.blue, color: "#fff", padding: 20, display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 8, flex: "0 0 auto" }}>
            {qr ? <img src={qr} alt="Membership QR" width={110} height={110} style={{ display: "block" }} /> : <div style={{ width: 110, height: 110 }} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Cookie Doh Member</div>
            <div style={{ opacity: 0.9, fontSize: 13, marginTop: 4 }}>{member.phone}</div>
            <div style={{ marginTop: 8, fontFamily: "monospace", fontWeight: 800, letterSpacing: 1 }}>{member.memberCode}</div>
            <div style={{ opacity: 0.85, fontSize: 12, marginTop: 8 }}>Show this at the counter to earn & redeem.</div>
          </div>
        </div>

        {/* Loyalty progress */}
        <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
          {cards.map((c) => (
            <div key={c.label} style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontWeight: 800, color: COLORS.black }}>{c.label}</span>
                <span style={{ fontSize: 13, color: COLORS.muted }}>{c.stamps}/10</span>
              </div>
              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 5 }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} style={{ height: 12, borderRadius: 6, background: i < c.stamps ? COLORS.blue : "rgba(0,0,0,0.10)" }} />
                ))}
              </div>
              {c.free > 0 ? (
                <div style={{ marginTop: 10, fontWeight: 800, color: "#0014A7" }}>🎁 {c.free} free {c.label.includes("Cookies") ? "cookie" : "drink"}{c.free > 1 ? "s" : ""} ready!</div>
              ) : (
                <div style={{ marginTop: 10, fontSize: 13, color: COLORS.muted }}>{10 - c.stamps} more to your next free one</div>
              )}
            </div>
          ))}
        </div>

        <p style={{ marginTop: 12, fontSize: 12, color: COLORS.muted, lineHeight: 1.5, textAlign: "center" }}>
          Every cookie &amp; drink you buy earns a stamp — singles, boxes, assortments &amp; bundles. Only redeemed free rewards don&apos;t.
        </p>

        {/* Birthday */}
        <div style={{ marginTop: 18, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16 }}>
          <div style={{ fontWeight: 800, color: COLORS.black, fontSize: 16 }}>🎂 Your birthday</div>
          <div style={{ marginTop: 4, fontSize: 13, color: COLORS.muted, lineHeight: 1.5 }}>Add it once and we'll surprise you with a free cookie every year 🍪</div>
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
