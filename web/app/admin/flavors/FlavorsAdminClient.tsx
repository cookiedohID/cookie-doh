"use client";

// web/app/admin/flavors/FlavorsAdminClient.tsx
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FLAVORS } from "@/lib/catalog";
import { useFlavorAvailability } from "@/lib/useFlavorAvailability";

const COLORS = {
  blue: "#0052CC",
  black: "#101010",
  white: "#FFFFFF",
  sand: "#FAF7F2",
};

export default function FlavorsAdminClient() {
  const { map, loading, refresh } = useFlavorAvailability();
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useMemo(() => {
    return FLAVORS.map((f: any) => {
      const override = map[String(f.id)];
      const soldOut = typeof override === "boolean" ? override : Boolean(f.soldOut);
      return { ...f, soldOutLive: soldOut };
    });
  }, [map]);

  async function setSoldOut(flavorId: string, soldOut: boolean) {
    setBusyId(flavorId);
    try {
      const res = await fetch("/api/admin/flavors/availability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // If you set ADMIN_TOKEN, include it here:
          ...(process.env.NEXT_PUBLIC_ADMIN_TOKEN
            ? { "x-admin-token": String(process.env.NEXT_PUBLIC_ADMIN_TOKEN) }
            : {}),
        },
        body: JSON.stringify({ flavor_id: flavorId, sold_out: soldOut }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        throw new Error(j?.error || "Failed to update");
      }

      await refresh();
    } catch (e: any) {
      alert(e?.message || "Failed to update");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#fff" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "22px 16px 80px" }}>
        <header style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 22, color: COLORS.black }}>Admin · Flavors</h1>
            <Link href="/admin/orders" style={{ color: COLORS.blue, fontWeight: 900, textDecoration: "none" }}>
              Orders →
            </Link>
          </div>
          <p style={{ margin: "6px 0 0", color: "#6B6B6B" }}>
            Toggle Sold Out to instantly update the storefront.
          </p>
          {loading ? (
            <div style={{ marginTop: 8, color: "#6B6B6B", fontWeight: 800, fontSize: 12 }}>
              Loading availability…
            </div>
          ) : null}
        </header>

        <section style={{ display: "grid", gap: 10 }}>
          {rows.map((f: any) => (
            <div
              key={f.id}
              style={{
                border: "1px solid rgba(0,0,0,0.10)",
                borderRadius: 18,
                padding: 12,
                background: COLORS.white,
                display: "grid",
                gridTemplateColumns: "72px 1fr auto",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div style={{ width: 72, height: 72, borderRadius: 14, overflow: "hidden", background: COLORS.sand, position: "relative" }}>
                {f.image ? (
                  <Image src={f.image} alt={f.name} fill style={{ objectFit: "cover" }} />
                ) : null}
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 950, color: COLORS.black, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {f.name}
                </div>
                <div style={{ marginTop: 4, color: "#6B6B6B", fontSize: 12, lineHeight: 1.35 }}>
                  ID: {f.id}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSoldOut(String(f.id), !f.soldOutLive)}
                disabled={busyId === String(f.id)}
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "10px 12px",
                  fontWeight: 950,
                  cursor: busyId === String(f.id) ? "not-allowed" : "pointer",
                  background: f.soldOutLive ? "rgba(0,0,0,0.80)" : COLORS.blue,
                  color: "#fff",
                  minWidth: 120,
                }}
              >
                {busyId === String(f.id)
                  ? "Saving…"
                  : f.soldOutLive
                    ? "Sold Out: ON"
                    : "Sold Out: OFF"}
              </button>
            </div>
          ))}
        </section>

        <div style={{ marginTop: 16, color: "#6B6B6B", fontSize: 12, fontWeight: 800 }}>
          Note: You need a Supabase table called <b>flavor_availability</b> (flavor_id, sold_out, updated_at).
        </div>
      </div>
    </main>
  );
}
