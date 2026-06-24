"use client";

// web/components/YourUsuals.tsx
// "Your usuals" — a personalised quick-order strip for signed-in members, built
// from their order history (top cookies, top drinks, go-to bundle, usual box
// size). Renders NOTHING for guests or members with no history, so it's safe to
// drop on any page. Cookies/drinks add straight to the cart; box/bundle link to
// their builders (where the customer picks the exact items).
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { COLORS } from "@/lib/theme";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { SMOOTHIE_PRICE } from "@/lib/smoothies";
import { addUpsellSingle } from "@/lib/cart";

const COOKIE_PRICE = 32500;

type Item = { id: string; name: string; count: number; image?: string | null };
type Usuals = { cookies: Item[]; drinks: Item[]; bundles: any[]; boxSize: number | null };

export default function YourUsuals() {
  const [u, setU] = useState<Usuals | null>(null);
  const [added, setAdded] = useState<Record<string, number>>({});

  useEffect(() => {
    getSupabaseBrowser().auth.getSession().then(async ({ data }) => {
      const t = data.session?.access_token;
      if (!t) return;
      try {
        const res = await fetch("/api/account/favourites", { headers: { Authorization: `Bearer ${t}` } });
        const j = await res.json();
        if (j?.ok) setU({ cookies: j.cookies || [], drinks: j.drinks || [], bundles: j.bundles || [], boxSize: j.boxSize ?? null });
      } catch {
        /* a nicety — stay silent on failure */
      }
    });
  }, []);

  if (!u) return null;
  const hasItems = u.cookies.length || u.drinks.length;
  const hasCtas = !!u.boxSize || u.bundles.length;
  if (!hasItems && !hasCtas) return null;

  function add(kind: "cookie" | "drink", it: Item) {
    addUpsellSingle({
      id: it.id, name: it.name, kind,
      price: kind === "drink" ? SMOOTHIE_PRICE : COOKIE_PRICE,
      image: it.image || undefined,
    });
    setAdded((a) => ({ ...a, [it.id]: (a[it.id] || 0) + 1 }));
    // Nudge the header cart badge to refresh (it listens on window focus).
    try { window.dispatchEvent(new Event("focus")); } catch {}
  }

  const cookies = u.cookies.slice(0, 4);
  const drinks = u.drinks.slice(0, 3);
  const topBundle = u.bundles[0];

  return (
    <section style={{ background: "#EAF0FF", padding: "20px 16px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: COLORS.blue }}>👋 Your usuals</div>
        <div style={{ color: COLORS.muted, fontSize: 13, margin: "2px 0 12px" }}>
          Quick-add what you order most — or jump back into your favourites.
        </div>

        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
          {cookies.map((it) => (
            <Card key={"c" + it.id} it={it} added={added[it.id]} onAdd={() => add("cookie", it)} />
          ))}
          {drinks.map((it) => (
            <Card key={"d" + it.id} it={it} added={added[it.id]} onAdd={() => add("drink", it)} tag="drink" />
          ))}

          {u.boxSize && (
            <CtaCard
              href="/build"
              title={`Box of ${u.boxSize}`}
              sub="Your usual — build one"
              emoji="🍪"
            />
          )}
          {topBundle && (
            <CtaCard
              href="/bundles"
              title={topBundle.name}
              sub="Your go-to bundle"
              emoji="🎁"
            />
          )}
        </div>
      </div>
    </section>
  );
}

function Card({ it, added, onAdd, tag }: { it: Item; added?: number; onAdd: () => void; tag?: string }) {
  return (
    <div style={{ flex: "0 0 auto", width: 132, background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(0,0,0,0.06)" }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "1/1", background: "#f3f0ea" }}>
        {it.image ? <Image src={it.image} alt={it.name} fill sizes="132px" style={{ objectFit: "cover" }} /> : null}
        {tag === "drink" && (
          <span style={{ position: "absolute", top: 6, left: 6, background: "rgba(255,255,255,0.9)", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800, color: COLORS.blue }}>Drink</span>
        )}
      </div>
      <div style={{ padding: "8px 10px" }}>
        <div style={{ fontWeight: 700, fontSize: 12.5, lineHeight: 1.2, minHeight: 30 }}>{it.name}</div>
        <button
          onClick={onAdd}
          style={{ marginTop: 6, width: "100%", border: "none", borderRadius: 999, padding: "7px 0", fontWeight: 800, fontSize: 13, cursor: "pointer", background: added ? COLORS.blue : "#fff", color: added ? "#fff" : COLORS.blue, boxShadow: added ? "none" : `inset 0 0 0 1.5px ${COLORS.blue}` }}
        >
          {added ? `Added ×${added}` : "+ Add"}
        </button>
      </div>
    </div>
  );
}

function CtaCard({ href, title, sub, emoji }: { href: string; title: string; sub: string; emoji: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none", flex: "0 0 auto", width: 150 }}>
      <div style={{ height: "100%", background: COLORS.blue, color: "#fff", borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 120 }}>
        <div style={{ fontSize: 22 }}>{emoji}</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.2 }}>{title}</div>
          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>{sub} →</div>
        </div>
      </div>
    </Link>
  );
}
