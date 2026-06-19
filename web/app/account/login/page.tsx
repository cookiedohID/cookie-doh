"use client";

// web/app/account/login/page.tsx
import { useState } from "react";
import { useRouter } from "next/navigation";
import { COLORS } from "@/lib/theme";
import { signInWithEmail, signUpWithEmail, signInWithGoogle, requestPasswordReset } from "@/lib/memberAuth";
import { canonicalPhone } from "@/lib/phone";

const field: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.18)",
  fontSize: 15,
};

export default function MemberLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [step, setStep] = useState<"form" | "otp">("form");
  const [resetSent, setResetSent] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  function emailValid(e: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

  async function sendCode() {
    const res = await fetch("/api/account/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    return res.json().catch(() => ({ ok: false, error: "Network error" }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      if (mode === "reset") {
        if (!emailValid(email)) return setErr("Enter a valid email.");
        const res = await requestPasswordReset(email);
        if ((res as any)?.error) return setErr((res as any).error);
        setResetSent(true);
        setNote(`If an account exists for ${email}, we've sent a reset link. Check your inbox (and spam).`);
        return;
      }

      if (mode === "login") {
        const res = await signInWithEmail(email, password);
        if ((res as any)?.error) return setErr((res as any).error);
        router.push("/account");
        return;
      }

      // Sign up — step 1: validate, then send WhatsApp code
      if (step === "form") {
        if (!emailValid(email)) return setErr("Enter a valid email.");
        if (!canonicalPhone(phone)) return setErr("Enter a valid phone (08… or +628…).");
        if (password.length < 6) return setErr("Password must be at least 6 characters.");
        const j = await sendCode();
        if (!j?.ok) return setErr(j?.error || "Couldn't send the code.");
        setStep("otp");
        setNote(`We sent a 6-digit code to ${phone} on WhatsApp.`);
        return;
      }

      // Sign up — step 2: verify code, then create the account
      const v = await fetch("/api/account/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      }).then((r) => r.json()).catch(() => ({ ok: false, error: "Network error" }));
      if (!v?.ok) return setErr(v?.error || "Incorrect code.");

      const res = await signUpWithEmail(email, password, name, phone);
      if ((res as any)?.error) return setErr((res as any).error);
      router.push("/account");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setErr(""); setNote("");
    const j = await sendCode();
    setNote(j?.ok ? "New code sent on WhatsApp." : "");
    if (!j?.ok) setErr(j?.error || "Couldn't resend.");
  }

  async function google() {
    setErr("");
    const res = await signInWithGoogle();
    if ((res as any)?.error) setErr((res as any).error);
  }

  function switchMode() {
    setErr(""); setNote(""); setStep("form");
    setMode(mode === "login" ? "signup" : "login");
  }

  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg }}>
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "40px 16px 80px" }}>
        <span className="font-dearjoe" style={{ fontSize: 24, color: COLORS.blue }}>cookie doh members</span>
        <h1 style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 800, color: COLORS.black }}>
          {mode === "reset" ? "Reset password" : mode === "login" ? "Welcome back" : step === "otp" ? "Verify your number" : "Join the club"}
        </h1>
        <p style={{ margin: "8px 0 0", color: COLORS.muted, fontSize: 14 }}>
          {mode === "reset"
            ? note || "Enter your email and we'll send you a link to set a new password."
            : step === "otp"
            ? note || "Enter the code from WhatsApp."
            : "Earn a free cookie every 10 cookies, and a free drink every 10 drinks. Single cookies, drinks, boxes & assortments count toward stamps — bundles and other promotional items don’t."}
        </p>

        <form onSubmit={onSubmit} style={{ marginTop: 22, display: "grid", gap: 10 }}>
          {mode === "signup" && step === "form" ? (
            <input style={field} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          ) : null}

          {mode === "reset" ? (
            !resetSent ? (
              <input style={field} type="email" placeholder="Email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            ) : null
          ) : step === "form" ? (
            <>
              <input style={field} type="email" placeholder="Email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              {mode === "signup" ? (
                <input style={field} placeholder="Phone (08… or +628…) — your member number" inputMode="tel" value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, ""))} />
              ) : null}
              <input style={field} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </>
          ) : (
            <input
              style={{ ...field, letterSpacing: 6, textAlign: "center", fontSize: 22, fontWeight: 800 }}
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          )}

          {err ? <div style={{ color: "crimson", fontSize: 13, fontWeight: 700 }}>{err}</div> : null}

          {!(mode === "reset" && resetSent) ? (
            <button type="submit" disabled={busy}
              style={{ marginTop: 4, height: 50, borderRadius: 999, border: "none", background: COLORS.blue, color: "#fff", fontWeight: 900, fontSize: 16, cursor: busy ? "not-allowed" : "pointer" }}>
              {busy ? "…" : mode === "reset" ? "Send reset link" : mode === "login" ? "Log in" : step === "otp" ? "Verify & create account" : "Continue"}
            </button>
          ) : null}

          {mode === "signup" && step === "otp" ? (
            <button type="button" onClick={resend} style={{ border: "none", background: "none", color: COLORS.blue, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
              Resend code
            </button>
          ) : null}
        </form>

        {mode === "reset" ? (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <button type="button" onClick={() => { setMode("login"); setResetSent(false); setErr(""); setNote(""); }} style={{ border: "none", background: "none", color: COLORS.muted, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
              ← Back to log in
            </button>
          </div>
        ) : step === "form" ? (
          <>
            {mode === "login" ? (
              <div style={{ marginTop: 12, textAlign: "center" }}>
                <button type="button" onClick={() => { setMode("reset"); setResetSent(false); setErr(""); setNote(""); }} style={{ border: "none", background: "none", color: COLORS.blue, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                  Forgot password?
                </button>
              </div>
            ) : null}
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0", color: COLORS.muted, fontSize: 12 }}>
              <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.12)" }} />or<div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.12)" }} />
            </div>
            <button type="button" onClick={google}
              style={{ width: "100%", height: 50, borderRadius: 999, border: "1px solid rgba(0,0,0,0.18)", background: "#fff", color: COLORS.black, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
              Continue with Google
            </button>

            <div style={{ marginTop: 20, textAlign: "center", fontSize: 14, color: COLORS.muted }}>
              {mode === "login" ? "New here?" : "Already a member?"}{" "}
              <button type="button" onClick={switchMode} style={{ border: "none", background: "none", color: COLORS.blue, fontWeight: 800, cursor: "pointer" }}>
                {mode === "login" ? "Create an account" : "Log in"}
              </button>
            </div>
          </>
        ) : (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <button type="button" onClick={() => { setStep("form"); setErr(""); setNote(""); }} style={{ border: "none", background: "none", color: COLORS.muted, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
              ← Change details
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
