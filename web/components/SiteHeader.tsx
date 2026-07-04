// web/components/SiteHeader.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getCart } from "@/lib/cart";
import { COLORS } from "@/lib/theme";

type NavItem = { href: string; label: string };

function cartCount() {
  try {
    const c = getCart();
    return (c.boxes || []).reduce((sum, b) => {
      const n = (b.items || []).reduce((s, it) => s + (it.quantity || 0), 0);
      return sum + n;
    }, 0);
  } catch {
    return 0;
  }
}

// ── TotalBuahStore header (full brand takeover on /tbs) ─────────────────────
const TBS_RED = "#9c1216";
const TBS_GREEN = "#135232";

function tbsBasketCount(): number {
  try {
    const raw = JSON.parse(localStorage.getItem("tbs_basket") || "null");
    if (!raw?.items) return 0;
    return (Object.values(raw.items) as { qty?: number }[]).reduce((n, l) => n + (l.qty || 0), 0);
  } catch { return 0; }
}

function TbsHeader({ pathname }: { pathname: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const refresh = () => setN(tbsBasketCount());
    refresh();
    window.addEventListener("tbs-basket", refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("tbs-basket", refresh); window.removeEventListener("focus", refresh); };
  }, [pathname]);
  const tab = (active: boolean): React.CSSProperties => ({
    textDecoration: "none", whiteSpace: "nowrap", padding: "8px 11px", borderRadius: 999,
    fontWeight: active ? 900 : 700, fontSize: 14,
    color: active ? TBS_RED : "#333", background: active ? "#FBEFEA" : "transparent",
  });
  const basketClick = () => {
    if (location.pathname === "/tbs") window.dispatchEvent(new Event("tbs-open-basket"));
    else location.href = "/tbs";
  };
  return (
    <>
    <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
      {/* brand strip — official tagline, verbatim */}
      <div style={{ background: TBS_RED, color: "#fff", textAlign: "center", fontSize: 11.5, fontWeight: 800, letterSpacing: 1.2, padding: "5px 10px", textTransform: "uppercase" }}>
        100% Fresh. Today and Always
      </div>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "8px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/tbs" aria-label="TotalBuahStore home" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", flex: "0 0 auto" }}>
          {/* real TBS logo asset (plain img — the optimizer washes out this sketch PNG at small sizes) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tbs/logo.png" alt="tbs" style={{ height: 46, width: "auto", display: "block" }} />
          <span style={{ fontWeight: 900, fontSize: 17, color: TBS_GREEN, letterSpacing: 0.3 }}>TotalBuahStore</span>
        </Link>
        <nav aria-label="TBS" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 2, overflowX: "auto" }}>
          <Link href="/tbs" style={tab(pathname === "/tbs")}>Shop</Link>
          <Link href="/account" style={tab(pathname.startsWith("/account"))}>Member</Link>
          <Link href="/" style={{ textDecoration: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6, background: "#0014A7", color: "#fff", borderRadius: 999, padding: "8px 13px", fontWeight: 800, fontSize: 13.5 }}>
            🍪 <span>Cookie Doh</span>
          </Link>
          <button onClick={basketClick} aria-label={`Basket, ${n} items`} style={{ border: "none", background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 900, color: TBS_GREEN, padding: "8px 6px 8px 10px", fontSize: 16 }}>
            🧺{n > 0 ? <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: TBS_RED, color: "#fff", fontSize: 11.5, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{n}</span> : null}
          </button>
        </nav>
      </div>
    </header>
    {/* spacer for the fixed header (strip ~26px + bar ~63px) */}
    <div style={{ height: 90 }} />
    </>
  );
}

function Badge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span
      style={{
        minWidth: 18,
        height: 18,
        padding: "0 6px",
        borderRadius: 999,
        background: "#FFFFFF",
        color: COLORS.black,
        fontWeight: 950,
        fontSize: 12,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1,
        border: "1px solid rgba(0,0,0,0.10)",
      }}
      aria-label={`${n} items in cart`}
    >
      {n}
    </span>
  );
}

export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [tbsShop, setTbsShop] = useState(false);

  // TotalBuahStore shop tab — feature-flagged (admins preview before launch).
  useEffect(() => {
    fetch("/api/tbs/enabled", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setTbsShop(Boolean(j?.enabled)))
      .catch(() => { /* tab stays hidden */ });
  }, []);

  const nav: NavItem[] = useMemo(
    () => [
      { href: "/assortments", label: "Assortments" },
      { href: "/cookies", label: "Cookies" },
      { href: "/smoothies", label: "Smoothies" },
      { href: "/bundles", label: "Bundles" },
      ...(tbsShop ? [{ href: "/tbs", label: "TotalBuahStore" }] : []),
      { href: "/account", label: "Member" },
    ],
    [tbsShop]
  );

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // refresh cart badge on navigation + focus
  useEffect(() => {
    const refresh = () => setCount(cartCount());
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [pathname]);

  // Kiosk mode: the cafe POS is a standalone full-screen register — hide the
  // storefront nav so a walk-in customer can't navigate away from it.
  if (pathname?.startsWith("/cafe")) return null;

  // ── TotalBuahStore takeover ─────────────────────────────────────────────
  // On /tbs the WHOLE header becomes TBS (owner decision 2026-07-04): TBS logo,
  // tagline strip, its own nav — and Cookie Doh becomes just a menu tab.
  if (pathname?.startsWith("/tbs")) {
    return <TbsHeader pathname={pathname} />;
  }

  // Admin mode: show admin functions instead of the storefront nav. The logo
  // still links to the storefront homepage. The login page keeps a bare header.
  if (pathname?.startsWith("/admin") && pathname !== "/admin/login") {
    const adminNav: NavItem[] = [
      { href: "/admin", label: "Home" },
      { href: "/admin/orders", label: "Orders" },
      { href: "/admin/flavors", label: "Inventory" },
      { href: "/admin/locations", label: "Locations" },
      { href: "/admin/reports", label: "Reports" },
      { href: "/admin/customers", label: "Customers" },
      { href: "/admin/broadcast", label: "Broadcast" },
      { href: "/admin/promos", label: "Promos" },
      { href: "/admin/spend-rewards", label: "Spend rewards" },
      { href: "/admin/help", label: "Manual" },
    ];
    const adminActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/"));
    return (
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: COLORS.blue, borderBottom: "1px solid rgba(255,255,255,0.14)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Link href="/" aria-label="Cookie Doh storefront" style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
            <Image src="/logo.png" alt="Cookie Doh" width={140} height={28} priority style={{ height: "auto", width: "140px", maxWidth: "100%" }} />
          </Link>
          <nav aria-label="Admin" style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
            {adminNav.map((item) => {
              const active = adminActive(item.href);
              return (
                <Link key={item.href} href={item.href} style={{
                  textDecoration: "none", color: "rgba(255,255,255,0.92)", fontWeight: active ? 950 : 800,
                  padding: "7px 11px", borderRadius: 999, whiteSpace: "nowrap",
                  background: active ? "rgba(255,255,255,0.16)" : "transparent",
                }}>
                  {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={async () => { await fetch("/api/admin/login", { method: "DELETE" }); window.location.href = "/admin/login"; }}
              style={{ border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#fff", fontWeight: 800, fontSize: 13, padding: "7px 12px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              Log out
            </button>
          </nav>
        </div>
      </header>
    );
  }

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: COLORS.blue,
        borderBottom: "1px solid rgba(255,255,255,0.14)",
      }}
    >
      <style>{`
        .cd-desktop-nav { display: none; }
        .cd-mobile-actions { display: flex; }
        @media (min-width: 860px) {
          .cd-desktop-nav { display: flex; }
          .cd-mobile-actions { display: none; }
        }
        .cd-logo { width: 205px; }
        @media (max-width: 600px) { .cd-logo { width: 158px; } }
      `}</style>

      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Link
          href="/"
          onClick={(e) => {
            // Already on home: don't re-navigate, just scroll back to the top.
            if (pathname === "/") {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
          style={{
            textDecoration: "none",
            color: "inherit",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flex: "0 0 auto",
          }}
          aria-label="Cookie Doh home"
        >
          <Image
            src="/logo.png"
            alt="Cookie Doh"
            width={205}
            height={41}
            priority
            className="cd-logo"
            style={{ height: "auto", flex: "0 0 auto", maxWidth: "100%" }}
          />
        </Link>

        {/* Desktop nav */}
        <nav
          className="cd-desktop-nav"
          aria-label="Primary"
          style={{
            marginLeft: "auto",
            gap: 7,
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          {nav.map((item) => {
            const active = isActive(item.href);
            const isTbs = item.href === "/tbs";
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  textDecoration: "none",
                  color: isTbs ? "#fff" : "rgba(255,255,255,0.92)",
                  fontWeight: active ? 950 : 800,
                  padding: isTbs ? "8px 13px" : "8px 8px",
                  borderRadius: 999,
                  whiteSpace: "nowrap",
                  border: active && !isTbs ? "1px solid rgba(255,255,255,0.35)" : "1px solid transparent",
                  background: isTbs ? "#9c1216" : active ? "rgba(255,255,255,0.12)" : "transparent",
                }}
              >
                {isTbs ? "🍒 " : ""}{item.label}
              </Link>
            );
          })}

          <Link
            href="/build"
            style={{
              textDecoration: "none",
              background: "#FFFFFF",
              color: COLORS.black,
              borderRadius: 999,
              padding: "10px 14px",
              fontWeight: 950,
              border: isActive("/build") ? "2px solid rgba(0,0,0,0.14)" : "1px solid rgba(0,0,0,0.10)",
              boxShadow: "0 10px 22px rgba(0,0,0,0.10)",
              whiteSpace: "nowrap",
            }}
          >
            Build Your Box
          </Link>

          <Link
            href="/cart"
            aria-label={count > 0 ? `Cart, ${count} items` : "Cart"}
            title="Cart"
            style={{
              textDecoration: "none",
              color: "rgba(255,255,255,0.92)",
              padding: "8px 9px",
              borderRadius: 999,
              whiteSpace: "nowrap",
              border: isActive("/cart") ? "1px solid rgba(255,255,255,0.35)" : "1px solid transparent",
              background: isActive("/cart") ? "rgba(255,255,255,0.12)" : "transparent",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <Badge n={count} />
          </Link>
        </nav>

        {/* Mobile actions */}
        <div className="cd-mobile-actions" style={{ marginLeft: "auto", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            style={{
              height: 40,
              width: 44,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(255,255,255,0.10)",
              color: "#fff",
              fontWeight: 900,
              cursor: "pointer",
              position: "relative",
            }}
          >
            ☰
            {/* cart badge shown on mobile top bar too */}
            {count > 0 && (
              <span style={{ position: "absolute", top: -6, right: -6 }}>
                <Badge n={count} />
              </span>
            )}
          </button>

          <Link
            href="/build"
            style={{
              textDecoration: "none",
              background: "#FFFFFF",
              color: COLORS.black,
              borderRadius: 999,
              padding: "10px 12px",
              fontWeight: 950,
              border: "1px solid rgba(0,0,0,0.10)",
              boxShadow: "0 10px 22px rgba(0,0,0,0.10)",
              whiteSpace: "nowrap",
            }}
          >
            Build
          </Link>
        </div>
      </div>

      {/* Drawer */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.45)" }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              height: "100%",
              width: "min(360px, 92vw)",
              background: "#fff",
              padding: 14,
              boxShadow: "-20px 0 40px rgba(0,0,0,0.18)",
              display: "grid",
              gap: 10,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 950, color: COLORS.black }}>Menu</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                style={{
                  height: 40,
                  width: 44,
                  borderRadius: 999,
                  border: "1px solid rgba(0,0,0,0.12)",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {nav.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      textDecoration: "none",
                      padding: "12px 12px",
                      borderRadius: 14,
                      border: active ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.10)",
                      background: active ? "rgba(0,82,204,0.06)" : "#FAF7F2",
                      color: COLORS.black,
                      fontWeight: 900,
                    }}
                  >
                    {item.label}
                  </Link>
                );
              })}

              <Link
                href="/cart"
                style={{
                  textDecoration: "none",
                  padding: "12px 12px",
                  borderRadius: 14,
                  border: isActive("/cart") ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.10)",
                  background: isActive("/cart") ? "rgba(0,82,204,0.06)" : "#FAF7F2",
                  color: COLORS.black,
                  fontWeight: 900,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span>Cart</span>
                <Badge n={count} />
              </Link>
            </div>

            <Link
              href="/build"
              style={{
                marginTop: 6,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                height: 52,
                background: COLORS.blue,
                color: "#fff",
                fontWeight: 950,
                boxShadow: "0 10px 22px rgba(0,0,0,0.10)",
              }}
            >
              Build Your Box
            </Link>

            <div style={{ marginTop: 6, color: "#6B6B6B", fontWeight: 800, fontSize: 12 }}>
              Freshly baked · Packed with care · Gift-ready
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
