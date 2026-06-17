"use client";

// web/app/account/page.tsx
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { COLORS } from "@/lib/theme";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { signOutMember } from "@/lib/memberAuth";
import { canonicalPhone } from "@/lib/phone";

type Member = {
  name: string | null;
  phone: string;
  memberCode: string;
  loyalty: { cookieStamps: number; drinkStamps: number; freeCookies: number; freeDrinks: number };
};

export default function AccountPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<Member | null>(null);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [phone, setPhone] = useState("");
  const [otpStep, setOtpStep] = useState<"phone" | "code">("phone");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [qr, setQr] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function token() {
    const { data } = await getSupabaseBrowser().auth.getSession();
    return data.session?.access_token || null;
  }

  async function load() {
    setLoading(true);
    try {
      const t = await token();
      if (!t) { router.replace("/account/login"); return; }
      const res = await fetch("/api/account/me", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) { router.replace("/account/login"); return; }
      if (j?.needsPhone) {
        setNeedsPhone(true);
        if (j?.phone) setPhone(j.phone); // re-verify an existing-but-unverified number
        return;
      }
      if (j?.member) { setMember(j.member); }
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
    await signOutMember();
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
          <h1 style={{ fontSize: 24, fontWeight: 800, color: COLORS.black }}>{otpStep === "code" ? "Verify your number" : "One more thing"}</h1>
          <p style={{ color: COLORS.muted, fontSize: 14 }}>
            {otpStep === "code" ? (note || "Enter the code from WhatsApp.") : "Add your phone number to activate your membership & loyalty."}
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

  if (!member) return null;

  const L = member.loyalty;
  const cards = [
    { label: "🍪 Cookies", stamps: L.cookieStamps, free: L.freeCookies },
    { label: "🥤 Drinks", stamps: L.drinkStamps, free: L.freeDrinks },
  ];

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
                <div style={{ marginTop: 10, fontWeight: 800, color: "#127a3e" }}>🎁 {c.free} free {c.label.includes("Cookies") ? "cookie" : "drink"}{c.free > 1 ? "s" : ""} ready!</div>
              ) : (
                <div style={{ marginTop: 10, fontSize: 13, color: COLORS.muted }}>{10 - c.stamps} more to your next free one</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
