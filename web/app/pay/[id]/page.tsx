"use client";

// web/app/pay/[id]/page.tsx — "finish your payment" page for an unpaid order.
// Reached from the abandoned-cart WhatsApp nudge. Reopens the order's saved Snap
// popup so the customer can complete checkout without rebuilding their cart.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { COLORS } from "@/lib/theme";

const SNAP_PROD = "https://app.midtrans.com/snap/snap.js";
const SNAP_SANDBOX = "https://app.sandbox.midtrans.com/snap/snap.js";

function loadSnap(isProd: boolean): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.snap) return resolve(w.snap);
    const s = document.createElement("script");
    s.src = isProd ? SNAP_PROD : SNAP_SANDBOX;
    s.setAttribute("data-client-key", process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || "");
    s.onload = () => resolve((window as any).snap);
    s.onerror = () => reject(new Error("Couldn't load the payment window. Check your connection and try again."));
    document.body.appendChild(s);
  });
}

type State = "loading" | "ready" | "paid" | "error";

export default function PayPage() {
  const params = useParams();
  const id = String((params as any)?.id || "");
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState("");
  const [info, setInfo] = useState<{ total?: number | null; name?: string | null }>({});

  // The /pay link carries ?t=<nudge_token>; resume needs it to release the token.
  function payToken(): string {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("t") || "";
  }

  async function fetchResume() {
    const t = payToken();
    const r = await fetch(`/api/checkout/resume?order=${encodeURIComponent(id)}&t=${encodeURIComponent(t)}`, {
      cache: "no-store",
    });
    return r.json().catch(() => ({}));
  }

  async function start() {
    setState("loading");
    setMsg("");
    try {
      const j = await fetchResume();
      if (j?.paid) {
        setState("paid");
        return;
      }
      if (!j?.ok || !j?.snap_token) {
        setState("error");
        setMsg(j?.error || "This payment link is no longer valid.");
        return;
      }
      setInfo({ total: j.total_idr, name: j.name });
      const isProd = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true";
      const snap = await loadSnap(isProd);
      setState("ready");
      snap.pay(j.snap_token, {
        onSuccess: () => (window.location.href = "/checkout/success"),
        // Bank transfer / VA / some e-wallets fire onPending when instructions are
        // issued but money hasn't arrived — never tell them it's "received".
        onPending: () => (window.location.href = "/checkout/success?transaction_status=pending"),
        onError: async () => {
          // They may have actually paid in another tab — re-check before scaring them.
          const again = await fetchResume().catch(() => ({}));
          if (again?.paid) {
            setState("paid");
            return;
          }
          setState("error");
          setMsg("Payment didn't go through, or the link expired. Please place a new order.");
        },
        onClose: () => {
          /* keep them on the page so they can reopen with the button */
        },
      });
    } catch (e: any) {
      setState("error");
      setMsg(e?.message || "Something went wrong. Please try again.");
    }
  }

  useEffect(() => {
    if (id) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <main style={{ minHeight: "100vh", background: COLORS.sand, display: "grid", placeItems: "center", padding: 18 }}>
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 20,
          padding: "30px 24px",
          textAlign: "center",
          boxShadow: "0 10px 40px rgba(0,0,0,0.06)",
        }}
      >
        <span className="font-dearjoe" style={{ fontSize: 24, color: COLORS.blue }}>
          cookie doh
        </span>

        {state === "paid" ? (
          <>
            <div style={{ fontSize: 40, marginTop: 10 }}>🎉</div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: COLORS.black, margin: "8px 0 4px" }}>You're all set!</h1>
            <p style={{ color: COLORS.muted, fontSize: 14 }}>This order is already paid. Thank you! 💛</p>
            <a href="/account/orders" style={btn}>View my orders</a>
          </>
        ) : state === "error" ? (
          <>
            <div style={{ fontSize: 40, marginTop: 10 }}>🍪</div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: COLORS.black, margin: "8px 0 4px" }}>Let's try that again</h1>
            <p style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.5 }}>{msg}</p>
            <button onClick={start} style={btn}>Retry payment</button>
            <a href="/build" style={{ ...linkBtn }}>Start a new order</a>
          </>
        ) : (
          <>
            <div style={{ fontSize: 40, marginTop: 10 }}>🍪</div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: COLORS.black, margin: "8px 0 4px" }}>
              {info.name ? `Almost there, ${String(info.name).split(" ")[0]}!` : "Almost there!"}
            </h1>
            <p style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.5 }}>
              {info.total
                ? `Finish paying Rp${Number(info.total).toLocaleString("id-ID")} to lock in your order.`
                : "Opening your secure payment window…"}
            </p>
            <button onClick={start} disabled={state === "loading"} style={{ ...btn, opacity: state === "loading" ? 0.6 : 1 }}>
              {state === "loading" ? "Loading…" : "Complete payment"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

const btn: React.CSSProperties = {
  display: "block",
  marginTop: 18,
  width: "100%",
  border: "none",
  background: COLORS.blue,
  color: "#fff",
  fontWeight: 900,
  fontSize: 16,
  padding: "14px",
  borderRadius: 999,
  cursor: "pointer",
  textDecoration: "none",
  boxSizing: "border-box",
};

const linkBtn: React.CSSProperties = {
  display: "block",
  marginTop: 10,
  color: COLORS.muted,
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
};
