// web/components/SiteHeader.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const COLORS = {
  blue: "#0014a7",
  black: "#101010",
  white: "#FFFFFF",
};

type NavItem = {
  href: string;
  label: string;
};

export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav: NavItem[] = [
    { href: "/", label: "All" },
    { href: "/assortments", label: "Assortments" },
    { href: "/cookies", label: "Cookies" },
    { href: "/cart", label: "Cart" },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  // close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // lock scroll when drawer open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

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
          {[
            { href: "/", label: "All" },
            { href: "/assortments", label: "Assortments" },
            { href: "/cookies", label: "Cookies" },
          ].map((item) => {
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
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}

          {/* Primary CTA */}
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
            aria-current={isActive("/build") ? "page" : undefined}
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
            }}
            aria-current={isActive("/cart") ? "page" : undefined}
          >
            Cart
          </Link>
        </nav>

        {/* Mobile actions: hamburger + Build CTA */}
        <div
          className="cd-mobile-actions"
          style={{ marginLeft: "auto", gap: 10, alignItems: "center" }}
        >
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
            }}
          >
            ☰
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

      {/* Mobile drawer */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(0,0,0,0.45)",
          }}
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
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
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
