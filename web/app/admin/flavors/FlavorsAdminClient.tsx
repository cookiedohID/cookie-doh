"use client";

// web/app/admin/flavors/FlavorsAdminClient.tsx
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FLAVORS } from "@/lib/catalog";
import { SMOOTHIES } from "@/lib/smoothies";
import { LOCATIONS, DEFAULT_LOCATION_ID } from "@/lib/locations";
import { useFlavorAvailability } from "@/lib/useFlavorAvailability";
import { COLORS } from "@/lib/theme";

type Item = { id: string; name: string; image?: string };

export default function FlavorsAdminClient() {
  const { byLocation, loading, refresh } = useFlavorAvailability();
  const [locationId, setLocationId] = useState<string>(DEFAULT_LOCATION_ID);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const cookies: Item[] = useMemo(
    () => FLAVORS.map((f: any) => ({ id: String(f.id), name: String(f.name), image: f.image })),
    []
  );
  const smoothies: Item[] = useMemo(
    () => SMOOTHIES.map((s) => ({ id: s.id, name: s.name, image: s.image })),
    []
  );

  const locRows = byLocation[locationId] || {};

  // Reset drafts when switching location, seeding from that location's stock.
  useEffect(() => {
    const seed: Record<string, string> = {};
    Object.entries(locRows).forEach(([id, r]) => {
      seed[id] = r.stock === null || r.stock === undefined ? "" : String(r.stock);
    });
    setDraft(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, JSON.stringify(locRows)]);

  async function save(itemId: string, patch: { sold_out?: boolean; stock?: number | null }) {
    setBusyId(itemId);
    try {
      const res = await fetch("/api/admin/flavors/availability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.NEXT_PUBLIC_ADMIN_TOKEN
            ? { "x-admin-token": String(process.env.NEXT_PUBLIC_ADMIN_TOKEN) }
            : {}),
        },
        body: JSON.stringify({ location_id: locationId, flavor_id: itemId, ...patch }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) throw new Error(j?.error || "Failed to update");
      await refresh();
    } catch (e: any) {
      alert(e?.message || "Failed to update");
    } finally {
      setBusyId(null);
    }
  }

  function Row({ item }: { item: Item }) {
    const r = locRows[item.id];
    const rawSoldOut = Boolean(r?.soldOut);
    const stock = r?.stock ?? null;
    const effectiveSoldOut = rawSoldOut || (typeof stock === "number" && stock <= 0);
    const busy = busyId === item.id;
    const draftVal = draft[item.id] ?? (stock === null ? "" : String(stock));
    const dirty = draftVal !== (stock === null ? "" : String(stock));

    return (
      <div
        style={{
          border: "1px solid rgba(0,0,0,0.10)",
          borderRadius: 16,
          padding: 12,
          background: COLORS.white,
          display: "grid",
          gridTemplateColumns: "60px 1fr",
          gap: 12,
          alignItems: "center",
          opacity: effectiveSoldOut ? 0.7 : 1,
        }}
      >
        <div style={{ width: 60, height: 60, borderRadius: 12, overflow: "hidden", background: COLORS.sand, position: "relative", flex: "0 0 auto" }}>
          {item.image ? <Image src={item.image} alt={item.name} fill style={{ objectFit: "cover" }} sizes="60px" /> : null}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
          <div style={{ minWidth: 120 }}>
            <div style={{ fontWeight: 800, color: COLORS.black }}>{item.name}</div>
            <div style={{ marginTop: 2, fontSize: 11.5, color: effectiveSoldOut ? COLORS.orange : "#6B6B6B", fontWeight: 700 }}>
              {effectiveSoldOut ? "SOLD OUT" : typeof stock === "number" ? `${stock} in stock` : "Not tracked"}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="∞"
              value={draftVal}
              onChange={(e) => setDraft((d) => ({ ...d, [item.id]: e.target.value }))}
              style={{ width: 70, padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.18)", fontWeight: 700, textAlign: "center" }}
              aria-label={`Stock for ${item.name}`}
            />
            <button
              type="button"
              disabled={busy || !dirty}
              onClick={() => save(item.id, { stock: draftVal === "" ? null : Number(draftVal) })}
              style={{ border: "none", borderRadius: 10, padding: "8px 12px", fontWeight: 800, cursor: busy || !dirty ? "not-allowed" : "pointer", background: dirty ? COLORS.blue : "rgba(0,0,0,0.12)", color: "#fff" }}
            >
              {busy ? "…" : "Save"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => save(item.id, { sold_out: !rawSoldOut })}
              title="Manual sold-out override"
              style={{ border: "none", borderRadius: 999, padding: "8px 12px", fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", background: rawSoldOut ? "rgba(0,0,0,0.80)" : "rgba(0,20,167,0.08)", color: rawSoldOut ? "#fff" : COLORS.blue, whiteSpace: "nowrap" }}
            >
              {rawSoldOut ? "Sold out ✓" : "Mark sold out"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#fff" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "22px 16px 80px" }}>
        <header style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 22, color: COLORS.black }}>Admin · Inventory</h1>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <Link href="/admin" style={{ color: COLORS.blue, fontWeight: 900, textDecoration: "none" }}>
                Home
              </Link>
              <Link href="/admin/locations" style={{ color: COLORS.blue, fontWeight: 900, textDecoration: "none" }}>
                Locations &amp; transfer →
              </Link>
              <Link href="/admin/orders" style={{ color: COLORS.blue, fontWeight: 900, textDecoration: "none" }}>
                Orders →
              </Link>
              <Link href="/admin/reports" style={{ color: COLORS.blue, fontWeight: 900, textDecoration: "none" }}>
                Reports →
              </Link>
            </div>
          </div>
          <p style={{ margin: "6px 0 0", color: "#6B6B6B", fontSize: 13.5, lineHeight: 1.4 }}>
            Stock is tracked <b>per location</b>. Pick a location, set a stock number per item
            (blank = unlimited). Items hit <b>Sold Out</b> at 0, or flip the manual toggle.
          </p>
        </header>

        {/* Location selector */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {LOCATIONS.map((loc) => {
            const active = loc.id === locationId;
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => setLocationId(loc.id)}
                style={{
                  border: active ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.14)",
                  background: active ? "rgba(0,20,167,0.06)" : "#fff",
                  color: COLORS.black,
                  borderRadius: 999,
                  padding: "8px 14px",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {loc.short}
              </button>
            );
          })}
        </div>

        {loading ? <div style={{ color: "#6B6B6B", fontWeight: 800, fontSize: 12, marginBottom: 8 }}>Loading…</div> : null}

        <h2 style={{ fontSize: 15, fontWeight: 800, color: COLORS.black, margin: "8px 0 8px" }}>Cookies</h2>
        <section style={{ display: "grid", gap: 10 }}>
          {cookies.map((f) => (
            <Row key={`${locationId}:${f.id}`} item={f} />
          ))}
        </section>

        <h2 style={{ fontSize: 15, fontWeight: 800, color: COLORS.black, margin: "22px 0 8px" }}>
          Smoothies (Cookie Doh Blend)
        </h2>
        <section style={{ display: "grid", gap: 10 }}>
          {smoothies.map((s) => (
            <Row key={`${locationId}:${s.id}`} item={s} />
          ))}
        </section>
      </div>
    </main>
  );
}
