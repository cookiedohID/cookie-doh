"use client";

// web/app/account/login/page.tsx
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { COLORS } from "@/lib/theme";
import { signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithGoogleToken, requestPasswordReset } from "@/lib/memberAuth";
import { canonicalPhone } from "@/lib/phone";

// Self-hosted Google (Google Identity Services). OFF → Supabase OAuth redirect.
const SELF_AUTH = process.env.NEXT_PUBLIC_AUTH_SELFHOSTED === "1";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

const field: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.18)",
  fontSize: 15,
};

const linkBtn: React.CSSProperties = {
  border: "none", background: "none", color: COLORS.blue, fontWeight: 700, cursor: "pointer", fontSize: 13,
};

export default function MemberLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [step, setStep] = useState<"form" | "otp">("form");
  // Reset can go two ways: WhatsApp OTP (primary — phone is the membership key)
  // or an email link (optional, only reaches members who set an email + once the
  // sending domain is verified in Resend).
  const [resetVia, setResetVia] = useState<"phone" | "email">("phone");
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

  // Google Identity Services button (self-hosted mode). Loads the GIS script,
  // renders Google's official button, and exchanges the returned ID token for a
  // member session. Inert unless AUTH_SELFHOSTED=1 and a client id is configured.
  const gbtnRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!SELF_AUTH || !GOOGLE_CLIENT_ID) return;
    const onCredential = async (resp: any) => {
      setErr("");
      const r = await signInWithGoogleToken(resp?.credential || "");
      if ((r as any)?.error) setErr((r as any).error);
      else router.push("/account");
    };
    const init = () => {
      const g = (window as any).google;
      if (!g?.accounts?.id) return false;
      g.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onCredential });
      if (gbtnRef.current) {
        gbtnRef.current.innerHTML = "";
        g.accounts.id.renderButton(gbtnRef.current, { theme: "outline", size: "large", shape: "pill", text: "continue_with", width: 320 });
      }
      return true;
    };
    if (init()) return;
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true;
    s.onload = () => init();
    document.head.appendChild(s);
  }, [router]);

  async function sendSignupCode() {
    const res = await fetch("/api/account/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    return res.json().catch(() => ({ ok: false, error: "Network error" }));
  }

  async function sendResetCode() {
    const res = await fetch("/api/auth/reset/phone/send", {
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
        // Email link (optional path)
        if (resetVia === "email") {
          if (!emailValid(email)) return setErr("Enter a valid email.");
          const res = await requestPasswordReset(email);
          if ((res as any)?.error) return setErr((res as any).error);
          setResetSent(true);
          setNote(`If an account exists for ${email}, we've sent a reset link. Check your inbox (and spam).`);
          return;
        }
        // WhatsApp OTP — step 1: send the code
        if (step === "form") {
          if (!canonicalPhone(phone)) return setErr("Enter a valid phone (08… or +628…).");
          const j = await sendResetCode();
          if (!j?.ok && j?.error) return setErr(j.error); // bad phone / not configured / throttled
          setStep("otp");
          setNote(`If a member account uses ${phone}, we sent a 6-digit reset code on WhatsApp.`);
          return;
        }
        // WhatsApp OTP — step 2: verify the code → reset token → set-password page
        const v = await fetch("/api/auth/reset/phone/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, code }),
        }).then((r) => r.json()).catch(() => ({ ok: false, error: "Network error" }));
        if (!v?.ok || !v?.token) return setErr(v?.error || "Incorrect code.");
        router.push(`/account/reset?token=${encodeURIComponent(v.token)}`);
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
        const j = await sendSignupCode();
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
    const j = mode === "reset" ? await sendResetCode() : await sendSignupCode();
    if (!j?.ok && j?.error) { setErr(j.error); return; }
    setNote("New code sent on WhatsApp.");
  }

  async function google() {
    setErr("");
    const res = await signInWithGoogle();
    if ((res as any)?.error) setErr((res as any).error);
  }

  function switchMode() {
    setErr(""); setNote(""); setStep("form"); setCode("");
    setMode(mode === "login" ? "signup" : "login");
  }

  // Enter reset mode (default: WhatsApp OTP).
  function startReset() {
    setMode("reset"); setResetVia("phone"); setStep("form");
    setResetSent(false); setCode(""); setErr(""); setNote("");
  }
  // Leave reset mode.
  function backToLogin() {
    setMode("login"); setResetVia("phone"); setStep("form");
    setResetSent(false); setCode(""); setErr(""); setNote("");
  }

  const resetTitle = resetVia === "phone" && step === "otp" ? "Enter your code" : "Reset password";
  const resetSubtitle = resetVia === "email"
    ? "Enter your email and we'll send a link to set a new password."
    : step === "otp"
    ? "Enter the 6-digit code we sent on WhatsApp."
    : "We'll send a 6-digit code to your WhatsApp number to reset your password.";

  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg }}>
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "40px 16px 80px" }}>
        <span className="font-dearjoe" style={{ fontSize: 24, color: COLORS.blue }}>TBS × cookie doh family</span>
        <h1 style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 800, color: COLORS.black }}>
          {mode === "reset" ? resetTitle : mode === "login" ? "Welcome back" : step === "otp" ? "Verify your number" : "Join the club"}
        </h1>
        <p style={{ margin: "8px 0 0", color: COLORS.muted, fontSize: 14 }}>
          {mode === "reset"
            ? note || resetSubtitle
            : step === "otp"
            ? note || "Enter the code from WhatsApp."
            : "Earn a free cookie every 10 cookies, and a free drink every 10 drinks. Single cookies, drinks, boxes & assortments count toward stamps — bundles and other promotional items don’t. TotalBuahStore items earn TBS reward points instead of stamps."}
        </p>

        <form onSubmit={onSubmit} style={{ marginTop: 22, display: "grid", gap: 10 }}>
          {mode === "signup" && step === "form" ? (
            <input style={field} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          ) : null}

          {mode === "reset" ? (
            resetVia === "email" ? (
              !resetSent ? (
                <input style={field} type="email" placeholder="Email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              ) : null
            ) : step === "form" ? (
              <input style={field} placeholder="Phone (08… or +628…) — your family number" inputMode="tel" value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, ""))} />
            ) : (
              <input
                style={{ ...field, letterSpacing: 6, textAlign: "center", fontSize: 22, fontWeight: 800 }}
                inputMode="numeric" maxLength={6} placeholder="••••••" value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            )
          ) : step === "form" ? (
            <>
              <input style={field} type="email" placeholder="Email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              {mode === "signup" ? (
                <input style={field} placeholder="Phone (08… or +628…) — your family number" inputMode="tel" value={phone}
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

          {!(mode === "reset" && resetVia === "email" && resetSent) ? (
            <button type="submit" disabled={busy}
              style={{ marginTop: 4, height: 50, borderRadius: 999, border: "none", background: COLORS.blue, color: "#fff", fontWeight: 900, fontSize: 16, cursor: busy ? "not-allowed" : "pointer" }}>
              {busy ? "…"
                : mode === "reset"
                ? (resetVia === "email" ? "Send reset link" : step === "form" ? "Send WhatsApp code" : "Verify & continue")
                : mode === "login" ? "Log in" : step === "otp" ? "Verify & create account" : "Continue"}
            </button>
          ) : null}

          {((mode === "signup" && step === "otp") || (mode === "reset" && resetVia === "phone" && step === "otp")) ? (
            <button type="button" onClick={resend} style={linkBtn}>
              Resend code
            </button>
          ) : null}
        </form>

        {mode === "reset" ? (
          <div style={{ marginTop: 16, textAlign: "center", display: "grid", gap: 10 }}>
            {resetVia === "phone" && step === "otp" ? (
              <button type="button" onClick={() => { setStep("form"); setCode(""); setErr(""); setNote(""); }} style={{ ...linkBtn, color: COLORS.muted }}>
                ← Change number
              </button>
            ) : resetVia === "phone" ? (
              <button type="button" onClick={() => { setResetVia("email"); setResetSent(false); setErr(""); setNote(""); }} style={linkBtn}>
                Reset by email instead
              </button>
            ) : !resetSent ? (
              <button type="button" onClick={() => { setResetVia("phone"); setStep("form"); setErr(""); setNote(""); }} style={linkBtn}>
                Reset by WhatsApp instead
              </button>
            ) : null}
            <button type="button" onClick={backToLogin} style={{ ...linkBtn, color: COLORS.muted }}>
              ← Back to log in
            </button>
          </div>
        ) : step === "form" ? (
          <>
            {mode === "login" ? (
              <div style={{ marginTop: 12, textAlign: "center" }}>
                <button type="button" onClick={startReset} style={linkBtn}>
                  Forgot password?
                </button>
              </div>
            ) : null}
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0", color: COLORS.muted, fontSize: 12 }}>
              <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.12)" }} />or<div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.12)" }} />
            </div>
            {SELF_AUTH && GOOGLE_CLIENT_ID ? (
              <div ref={gbtnRef} style={{ display: "flex", justifyContent: "center", minHeight: 44 }} />
            ) : (
              <button type="button" onClick={google}
                style={{ width: "100%", height: 50, borderRadius: 999, border: "1px solid rgba(0,0,0,0.18)", background: "#fff", color: COLORS.black, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
                Continue with Google
              </button>
            )}

            <div style={{ marginTop: 20, textAlign: "center", fontSize: 14, color: COLORS.muted }}>
              {mode === "login" ? "New to the family?" : "Already part of the family?"}{" "}
              <button type="button" onClick={switchMode} style={{ border: "none", background: "none", color: COLORS.blue, fontWeight: 800, cursor: "pointer" }}>
                {mode === "login" ? "Create an account" : "Log in"}
              </button>
            </div>
          </>
        ) : (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <button type="button" onClick={() => { setStep("form"); setErr(""); setNote(""); }} style={{ ...linkBtn, color: COLORS.muted }}>
              ← Change details
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
