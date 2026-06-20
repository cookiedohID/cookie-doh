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

  const nav: NavItem[] = useMemo(
    () => [
      { href: "/", label: "All" },
      { href: "/assortments", label: "Assortments" },
      { href: "/cookies", label: "Cookies" },
      { href: "/smoothies", label: "Smoothies" },
      { href: "/bundles", label: "Bundles" },
      { href: "/account", label: "Member" },
    ],
    []
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
      `}</style>

      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          padding: "12px 14px",
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
            minWidth: 0,
          }}
          aria-label="Cookie Doh home"
        >
          <Image
            src="/logo.png"
            alt="Cookie Doh"
            width={140}
            height={28}
            priority
            style={{ height: "auto", width: "140px", maxWidth: "100%" }}
          />
        </Link>

        {/* Desktop nav */}
        <nav
          className="cd-desktop-nav"
          aria-label="Primary"
          style={{
            marginLeft: "auto",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {nav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  textDecoration: "none",
                  color: "rgba(255,255,255,0.92)",
                  fontWeight: active ? 950 : 800,
                  padding: "8px 10px",
                  borderRadius: 999,
                  whiteSpace: "nowrap",
                  border: active ? "1px solid rgba(255,255,255,0.35)" : "1px solid transparent",
                  background: active ? "rgba(255,255,255,0.12)" : "transparent",
                }}
              >
                {item.label}
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
            style={{
              textDecoration: "none",
              color: "rgba(255,255,255,0.92)",
              fontWeight: isActive("/cart") ? 950 : 800,
              padding: "8px 10px",
              borderRadius: 999,
              whiteSpace: "nowrap",
              border: isActive("/cart") ? "1px solid rgba(255,255,255,0.35)" : "1px solid transparent",
              background: isActive("/cart") ? "rgba(255,255,255,0.12)" : "transparent",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            Cart <Badge n={count} />
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
