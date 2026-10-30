"use client";

// web/app/account/login/page.tsx
// Standalone, single-screen account page (Cookie Doh × TBS) — a two-column layout:
// a "family rewards" story panel on the left and the real sign-in form on the right,
// under its own blue brand header and a slim footer. The global SiteHeader/Footer/
// HolidayBanner/WhatsAppButton hide themselves on this exact route (/account/login)
// so this page owns the whole viewport. Design ported from the approved mockup;
// ALL auth behaviour (Google GIS, email+password, WhatsApp-OTP signup & reset,
// email-link reset fallback) is the real thing.
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithGoogleToken, requestPasswordReset } from "@/lib/memberAuth";
import { canonicalPhone } from "@/lib/phone";

// Self-hosted Google (Google Identity Services). OFF → Supabase OAuth redirect.
const SELF_AUTH = process.env.NEXT_PUBLIC_AUTH_SELFHOSTED === "1";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

// ── Inline brand icons (stroke-based; `.icon` gives them fill:none/stroke) ──
const IconArrow = () => (<svg className="icon" viewBox="0 0 24 24"><path d="M4 12h15m-5-5 5 5-5 5" /></svg>);
const IconMail = () => (<svg className="icon" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></svg>);
const IconLock = () => (<svg className="icon" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></svg>);
const IconEye = () => (<svg className="icon" viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>);
const IconEyeOff = () => (<svg className="icon" viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.4 5.2A9.7 9.7 0 0 1 12 5c7 0 10 7 10 7a15 15 0 0 1-3.1 4.1M6.1 6.1A15 15 0 0 0 2 12s3 7 10 7a9.6 9.6 0 0 0 3-.5" /></svg>);
const IconHeart = () => (<svg className="icon" viewBox="0 0 24 24"><path d="M12 20S2 14 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 6-10 12-10 12Z" /></svg>);
const IconCookie = () => (<svg className="icon" viewBox="0 0 32 32"><path d="M27 13a6 6 0 0 1-7-8 13 13 0 1 0 7 8Z" /><path d="m10 9 2 2-2 2-2-2Zm9 10 2 2-2 2-2-2Z" fill="currentColor" /><path d="m8 20 1 1m9-8 1 1m-4 10 1 1m8-9 1 1" strokeWidth={3} /></svg>);
const IconCup = () => (<svg className="icon" viewBox="0 0 32 32"><path d="M7 12h18l-2 15H9L7 12ZM5 8h22v4H5zM9 8l1-4h12l1 4M12 17h8M13 21h6" /></svg>);

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap');
#cd-login{--blue:#0014a8;--ink:#171e57;--cream:#faf8f1;--line:#dedfdc;--muted:#707287;min-height:100svh;display:grid;grid-template-rows:auto 1fr auto;background:var(--cream);color:var(--ink);font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased}
#cd-login *{box-sizing:border-box}
#cd-login button,#cd-login input{font:inherit}
#cd-login button{cursor:pointer;color:inherit}
#cd-login a{color:inherit;text-decoration:none}
#cd-login .icon{fill:none;stroke:currentColor;stroke-width:1.65;stroke-linecap:round;stroke-linejoin:round;width:24px;height:24px;flex-shrink:0}
#cd-login button:focus-visible,#cd-login a:focus-visible,#cd-login input:focus-visible{outline:3px solid #e6a348;outline-offset:3px}
#cd-login header{height:76px;display:flex;justify-content:space-between;align-items:center;padding:0 max(32px,calc((100vw - 1164px)/2));background:var(--blue);color:#fff}
#cd-login .brand-family{display:flex;align-items:center;gap:20px;flex-shrink:0}
#cd-login .logo{display:flex;align-items:center}
#cd-login .logo img{height:68px;width:68px;object-fit:contain;display:block}
#cd-login .brand-divider{height:30px;width:1px;background:#ffffff45}
#cd-login .tbs-brand{display:flex;align-items:center;gap:11px;color:#fff;font-size:14px;font-weight:600;white-space:nowrap}
#cd-login .tbs-badge{display:flex;align-items:center;justify-content:center;width:54px;height:54px}
#cd-login .tbs-badge img{width:100%;height:100%;object-fit:contain;display:block}
#cd-login .nav{display:flex;align-items:center;gap:28px;font-size:13px;font-weight:600}
#cd-login .shop{border:1px solid #ffffff65;border-radius:99px;padding:13px 19px;display:flex;gap:16px;align-items:center}
#cd-login .shop:hover{background:#ffffff16}
#cd-login .shop .icon{width:18px;height:18px}
#cd-login main{width:100%;max-width:1164px;margin:0 auto;padding:24px 32px;display:grid;grid-template-columns:1.1fr 1fr;gap:64px;align-items:stretch}
#cd-login .story{background:#e9edff;border-radius:18px;overflow:hidden;padding:24px 28px 18px;display:grid;grid-template-rows:auto auto auto minmax(0,1fr) auto}
#cd-login .eyebrow{font-size:9px;letter-spacing:2px;font-weight:700;text-transform:uppercase;display:flex;align-items:center;gap:9px;color:var(--ink)}
#cd-login .eyebrow:before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}
#cd-login .story h1{font-family:'Outfit',sans-serif;font-size:clamp(30px,3.1vw,43px);font-weight:600;line-height:1.05;letter-spacing:-1.6px;margin:12px 0 0}
#cd-login .story h1 em{font-family:Georgia,serif;font-weight:400;font-style:italic}
#cd-login .story>p{font-size:12px;line-height:1.5;margin:10px 0 0;max-width:360px;color:#505b8b}
#cd-login .brand-photo{margin:16px -28px 14px;overflow:hidden;display:flex;justify-content:center;background:#fff;min-height:0}
#cd-login .brand-photo img{width:100%;height:100%;object-fit:cover;object-position:center;display:block}
#cd-login .perks{border-top:1px solid #bbc4e6;display:grid;grid-template-columns:1fr 1fr;padding-top:12px;gap:10px;margin:0}
#cd-login .perk{display:flex;gap:8px}
#cd-login .perk .icon{width:25px;height:25px;color:var(--blue)}
#cd-login .perk b{font-size:11px;display:block}
#cd-login .perk span{font-size:10px;color:#5e678f;display:block;margin-top:3px}
#cd-login .form-area{padding:0;max-width:400px;width:100%;align-self:center}
#cd-login .family{font-size:9px;letter-spacing:1.8px;color:var(--blue);font-weight:700;margin-bottom:10px}
#cd-login .form-area h2{font-family:'Outfit',sans-serif;font-size:34px;letter-spacing:-1.4px;font-weight:600;margin:0}
#cd-login .intro{color:var(--muted);font-size:12px;line-height:1.5;margin:8px 0 18px}
#cd-login .google{width:100%;background:transparent;border:1px solid var(--line);border-radius:10px;display:flex;align-items:center;justify-content:center;gap:12px;height:44px;font-size:12px;font-weight:600}
#cd-login .google:hover{background:#fff}
#cd-login .google .g{font-size:20px;font-weight:800;color:#4285f4}
#cd-login .google-slot{display:flex;justify-content:center;min-height:44px}
#cd-login .divider{display:flex;align-items:center;gap:16px;color:#8b8b9b;font-size:10px;margin:16px 0}
#cd-login .divider:before,#cd-login .divider:after{content:'';height:1px;background:var(--line);flex:1}
#cd-login label{display:block;font-size:11px;font-weight:600;margin-bottom:6px}
#cd-login .field{position:relative;margin-bottom:13px}
#cd-login .field>.icon{position:absolute;left:15px;top:13px;width:18px;height:18px;color:#8a8da2}
#cd-login .field input{width:100%;height:43px;border:1px solid #d8dadf;background:#fffefa;border-radius:9px;padding:0 45px;color:var(--ink);font-size:12px}
#cd-login .field.plain input{padding:0 16px}
#cd-login .field input::placeholder{color:#a1a2af}
#cd-login .field .otp{letter-spacing:8px;text-align:center;font-size:20px;font-weight:800;padding:0 16px}
#cd-login .eye{border:0;background:none;position:absolute;right:12px;top:11px;padding:0;color:#8a8da2}
#cd-login .eye .icon{width:20px;height:20px}
#cd-login .row{display:flex;justify-content:space-between;align-items:center;margin:0 0 17px;font-size:11px}
#cd-login .remember{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:400;margin:0}
#cd-login .remember input{width:14px;height:14px;accent-color:var(--blue)}
#cd-login .text-btn{border:0;background:none;padding:0;color:var(--blue);font-size:11px;font-weight:600}
#cd-login .primary{width:100%;border:0;border-radius:10px;background:var(--blue);color:#fff;height:46px;display:flex;justify-content:center;align-items:center;gap:20px;font-size:13px;font-weight:600;margin-top:2px}
#cd-login .primary:hover{background:#071b8c}
#cd-login .primary:disabled{opacity:.6;cursor:not-allowed}
#cd-login .primary .icon{width:18px;height:18px}
#cd-login .err{color:#c0362c;font-size:12px;font-weight:700;margin:2px 0 10px}
#cd-login .status{font-size:11px;line-height:1.5;color:var(--blue);padding:10px;background:#e9edff;border-radius:8px;margin:2px 0 10px}
#cd-login .signup{text-align:center;font-size:11px;color:var(--muted);margin:15px 0 12px}
#cd-login .signup .text-btn{margin-left:4px;border-bottom:1px solid var(--blue);padding-bottom:2px}
#cd-login .linkrow{display:grid;gap:9px;text-align:center;margin-top:14px}
#cd-login .linkrow .muted{color:var(--muted)}
#cd-login .trust{display:flex;align-items:center;justify-content:center;gap:7px;font-size:9px;color:#9698a5;margin-top:10px}
#cd-login .trust .icon{width:14px;height:14px}
#cd-login footer{border-top:1px solid var(--line);padding:0 32px;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#777b90;width:100%;max-width:1164px;margin:0 auto;min-height:36px}
#cd-login footer .fcols{display:flex;gap:24px}
@media(max-width:950px){#cd-login main{gap:35px}#cd-login .nav{gap:16px}#cd-login .nav>a:first-child{display:none}#cd-login .brand-family{gap:12px}#cd-login .tbs-brand{font-size:12px;gap:8px}}
@media(max-width:720px){
#cd-login{grid-template-rows:66px 1fr auto}
#cd-login header{height:66px;padding:0 16px}
#cd-login .logo img{width:54px;height:54px}
#cd-login .nav>a:not(.shop){display:none}
#cd-login .brand-divider{height:26px}
#cd-login .tbs-badge{width:38px;height:38px}
#cd-login .tbs-brand{gap:7px;font-size:10px}
#cd-login .shop{font-size:10px;padding:9px 12px;gap:6px}
#cd-login .shop .icon{width:13px}
#cd-login main{display:grid;grid-template-columns:1fr;padding:12px 24px;gap:14px;max-width:480px}
#cd-login .story{display:block;padding:12px 16px;border-radius:12px;position:relative;min-height:76px}
#cd-login .story .eyebrow,#cd-login .story>p,#cd-login .perks{display:none}
#cd-login .story h1{font-size:23px;letter-spacing:-.7px;margin:0;padding-right:96px;line-height:1.13}
#cd-login .story h1 br{display:none}
#cd-login .brand-photo{position:absolute;right:0;top:0;bottom:0;width:92px;margin:0;border-radius:0 12px 12px 0}
#cd-login .form-area{margin:0 auto;max-width:400px}
#cd-login .form-area h2{font-size:29px}
#cd-login .family{display:none}
#cd-login footer{padding:10px 20px;justify-content:center;text-align:center;flex-direction:column;gap:8px}
}
`;

export default function MemberLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [step, setStep] = useState<"form" | "otp">("form");
  // Reset can go two ways: WhatsApp OTP (primary — phone is the membership key)
  // or an email link (optional, only reaches members who set an email).
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
  const [showPw, setShowPw] = useState(false);
  // "Remember me" is a familiar affordance; member sessions already persist
  // (token in localStorage), so checked reflects the default "stay signed in".
  const [remember, setRemember] = useState(true);

  function emailValid(e: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

  // Google Identity Services button (self-hosted mode). Loads the GIS script and
  // renders Google's official button into the slot, then exchanges the returned ID
  // token for a member session. Re-renders when the slot (re)appears across modes.
  const gbtnRef = useRef<HTMLDivElement>(null);
  const showGoogle = step === "form" && mode !== "reset";
  useEffect(() => {
    if (!SELF_AUTH || !GOOGLE_CLIENT_ID || !showGoogle) return;
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
        g.accounts.id.renderButton(gbtnRef.current, { theme: "outline", size: "large", shape: "pill", text: "continue_with", width: 360 });
      }
      return true;
    };
    if (init()) return;
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true;
    s.onload = () => init();
    document.head.appendChild(s);
  }, [router, showGoogle, mode, step]);

  async function sendSignupCode() {
    const res = await fetch("/api/account/otp/send", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }),
    });
    return res.json().catch(() => ({ ok: false, error: "Network error" }));
  }

  async function sendResetCode() {
    const res = await fetch("/api/auth/reset/phone/send", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }),
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
          setNote(`If an account exists for ${email}, we’ve sent a reset link. Check your inbox (and spam).`);
          return;
        }
        // WhatsApp OTP — step 1: send the code
        if (step === "form") {
          if (!canonicalPhone(phone)) return setErr("Enter a valid phone (08… or +628…).");
          const j = await sendResetCode();
          if (!j?.ok && j?.error) return setErr(j.error);
          setStep("otp");
          setNote(`If a member account uses ${phone}, we sent a 6-digit reset code on WhatsApp.`);
          return;
        }
        // WhatsApp OTP — step 2: verify the code → reset token → set-password page
        const v = await fetch("/api/auth/reset/phone/verify", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, code }),
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
        if (!j?.ok) return setErr(j?.error || "Couldn’t send the code.");
        setStep("otp");
        setNote(`We sent a 6-digit code to ${phone} on WhatsApp.`);
        return;
      }

      // Sign up — step 2: verify code, then create the account
      const v = await fetch("/api/account/otp/verify", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, code }),
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
  function startReset() {
    setMode("reset"); setResetVia("phone"); setStep("form");
    setResetSent(false); setCode(""); setErr(""); setNote("");
  }
  function backToLogin() {
    setMode("login"); setResetVia("phone"); setStep("form");
    setResetSent(false); setCode(""); setErr(""); setNote("");
  }

  const onPhone = (v: string) => setPhone(v.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, ""));

  const resetSubtitle = resetVia === "email"
    ? "Enter your email and we’ll send a link to set a new password."
    : step === "otp"
    ? "Enter the 6-digit code we sent on WhatsApp."
    : "We’ll send a 6-digit code to your WhatsApp number to reset your password.";

  const title = mode === "reset"
    ? (resetVia === "phone" && step === "otp" ? "Enter your code" : "A fresh start.")
    : mode === "login" ? "Hey, welcome back."
    : step === "otp" ? "Verify your number"
    : "You’re our kind of cookie.";

  const intro = mode === "reset" ? resetSubtitle
    : step === "otp" ? "Almost there — pop in the 6-digit code from WhatsApp."
    : mode === "login" ? "Your cookies, stamps, and little happy moments. All in one sweet place."
    : "Join the family and make every treat count.";

  const submitText = busy ? "…"
    : mode === "reset" ? (resetVia === "email" ? "Send reset link" : step === "form" ? "Send WhatsApp code" : "Verify & continue")
    : mode === "login" ? "Let’s get you in"
    : step === "otp" ? "Verify & create account"
    : "Create my account";

  const hidePrimary = mode === "reset" && resetVia === "email" && resetSent;

  return (
    <div id="cd-login">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header>
        <div className="brand-family">
          <a className="logo" href="/" aria-label="Cookie Doh home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/login/cookie-doh-logo.png" alt="Cookie Doh" width={68} height={68} />
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
          <a className="shop" href="/cookies">Build your box <IconArrow /></a>
        </nav>
      </header>

      <main>
        <section className="story" aria-label="Cookie Doh family rewards">
          <div className="eyebrow">The Cookie Doh family</div>
          <h1>Great cookies.<br /> Even <em>sweeter</em><br /> rewards.</h1>
          <p>A little treat today. A little something on us tomorrow. That’s what family is for.</p>
          <div className="brand-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/login/cookie-doh-hero.jpg" alt="Cookie Doh cookies and signature blue cups with berries, chocolate, vanilla and ice cream" width={1257} height={941} />
          </div>
          <div className="perks">
            <div className="perk"><IconCookie /><div><b>10 cookies = 1 free</b><span>Your next happy bite.</span></div></div>
            <div className="perk"><IconCup /><div><b>10 drinks = 1 free</b><span>A sip worth saving for.</span></div></div>
          </div>
        </section>

        <section className="form-area" aria-label="Sign in to your account">
          <div className="family">TBS × COOKIE DOH</div>
          <h2>{title}</h2>
          <p className="intro">{intro}</p>

          {showGoogle ? (
            <>
              {SELF_AUTH && GOOGLE_CLIENT_ID ? (
                <div ref={gbtnRef} className="google-slot" />
              ) : (
                <button type="button" className="google" onClick={google}>
                  <span className="g" aria-hidden="true">G</span>Continue with Google
                </button>
              )}
              <div className="divider">or with your email</div>
            </>
          ) : null}

          <form onSubmit={onSubmit}>
            {/* Name (signup only) */}
            {mode === "signup" && step === "form" ? (
              <div className="field plain"><input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} /></div>
            ) : null}

            {/* Email — login, signup, reset-by-email */}
            {((mode !== "reset" && step === "form") || (mode === "reset" && resetVia === "email" && !resetSent)) ? (
              <>
                {mode === "reset" ? <label>Email address</label> : null}
                <div className="field">
                  <IconMail />
                  <input type="email" inputMode="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </>
            ) : null}

            {/* Phone — signup, reset-by-phone (form step) */}
            {((mode === "signup" && step === "form") || (mode === "reset" && resetVia === "phone" && step === "form")) ? (
              <div className="field plain"><input inputMode="tel" placeholder="Phone (08… or +628…) — your family number" value={phone} onChange={(e) => onPhone(e.target.value)} /></div>
            ) : null}

            {/* Password — login & signup form step */}
            {mode !== "reset" && step === "form" ? (
              <div className="field">
                <IconLock />
                <input type={showPw ? "text" : "password"} placeholder="Enter your password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
                <button className="eye" type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"} aria-pressed={showPw}>
                  {showPw ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
            ) : null}

            {/* OTP code — signup/reset otp step */}
            {step === "otp" ? (
              <div className="field">
                <input className="otp" inputMode="numeric" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
              </div>
            ) : null}

            {err ? <div className="err">{err}</div> : null}
            {note ? <div className="status" role="status">{note}</div> : null}

            {/* Remember me + forgot — login only */}
            {mode === "login" ? (
              <div className="row">
                <label className="remember"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Remember me</label>
                <button className="text-btn" type="button" onClick={startReset}>Forgot password?</button>
              </div>
            ) : null}

            {!hidePrimary ? (
              <button className="primary" type="submit" disabled={busy}>
                <span>{submitText}</span>{!busy ? <IconArrow /> : null}
              </button>
            ) : null}

            {((mode === "signup" && step === "otp") || (mode === "reset" && resetVia === "phone" && step === "otp")) ? (
              <div className="linkrow"><button type="button" className="text-btn" onClick={resend}>Resend code</button></div>
            ) : null}
          </form>

          {/* Mode links */}
          {mode === "reset" ? (
            <div className="linkrow">
              {resetVia === "phone" && step === "otp" ? (
                <button type="button" className="text-btn muted" onClick={() => { setStep("form"); setCode(""); setErr(""); setNote(""); }}>← Change number</button>
              ) : resetVia === "phone" ? (
                <button type="button" className="text-btn" onClick={() => { setResetVia("email"); setResetSent(false); setErr(""); setNote(""); }}>Reset by email instead</button>
              ) : !resetSent ? (
                <button type="button" className="text-btn" onClick={() => { setResetVia("phone"); setStep("form"); setErr(""); setNote(""); }}>Reset by WhatsApp instead</button>
              ) : null}
              <button type="button" className="text-btn muted" onClick={backToLogin}>← Back to log in</button>
            </div>
          ) : step === "otp" ? (
            <div className="linkrow">
              <button type="button" className="text-btn muted" onClick={() => { setStep("form"); setErr(""); setNote(""); }}>← Change details</button>
            </div>
          ) : (
            <p className="signup">
              {mode === "login" ? "New to the family?" : "Already part of the family?"}
              <button type="button" className="text-btn" onClick={switchMode}>{mode === "login" ? "Join the cookie club" : "Back to log in"}</button>
            </p>
          )}

          <div className="trust"><IconHeart />A little love. A lot of cookies.</div>
        </section>
      </main>

      <footer>
        <span>© {new Date().getFullYear()} Cookie Doh. Made with love (and chocolate chips).</span>
        <div className="fcols">
          <a href="/help">Help &amp; FAQ</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </div>
      </footer>
    </div>
  );
}
