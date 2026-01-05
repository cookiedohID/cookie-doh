"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import styles from "./flavorCard.module.css";

import { BOX_PRICES, FLAVORS, formatIDR } from "@/lib/catalog";

type CartItem = {
  boxSize: number;
  items: { flavorId: string; qty: number }[];
  price: number;
  createdAt: number;
  giftNote?: string;
};

const CART_KEY = "cookieDohCart";
const SIZES: Array<1 | 3 | 6> = [1, 3, 6];

function clampSize(v: string | string[] | undefined): 1 | 3 | 6 | null {
  const s = Array.isArray(v) ? v[0] : v;
  const n = Number(s);
  if (n === 1 || n === 3 || n === 6) return n;
  return null;
}

function Meter({ value = 0 }: { value?: number }) {
  const filled = Math.max(0, Math.min(5, value));
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            display: "inline-block",
            border: "1px solid rgba(0,0,0,0.18)",
            background: i < filled ? "rgba(0,0,0,0.85)" : "transparent",
          }}
        />
      ))}
    </div>
  );
}

function BadgePill({ text }: { text: string }) {
  return (
    <span
      style={{
        padding: "5px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "rgba(0,0,0,0.04)",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function TagChip({ text }: { text: string }) {
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        border: "1px solid rgba(0,0,0,0.10)",
        background: "rgba(0,0,0,0.02)",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function SizeSwitcher({ current }: { current: 1 | 3 | 6 }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {SIZES.map((s) => {
        const active = s === current;
        return (
          <Link
            key={s}
            href={`/build/${s}`}
            prefetch={false}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: active ? "1px solid rgba(0,0,0,0.25)" : "1px solid #ddd",
              textDecoration: "none",
              fontWeight: 900,
              fontSize: 13,
              color: "inherit",
              background: active ? "rgba(0,0,0,0.06)" : "rgba(0,0,0,0.02)",
              cursor: "pointer",
            }}
            aria-current={active ? "page" : undefined}
          >
            Box {s}
          </Link>
        );
      })}
    </div>
  );
}

export default function BuildSizePage() {
  const router = useRouter();
  const params = useParams();
  const size = clampSize(params?.size);

  const [qtyByFlavor, setQtyByFlavor] = useState<Record<string, number>>({});
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const pickedCount = useMemo(
    () => Object.values(qtyByFlavor).reduce((sum, n) => sum + (Number(n) || 0), 0),
    [qtyByFlavor]
  );

  const remaining = (size ?? 0) - pickedCount;

  const selections = useMemo(() => {
    return Object.entries(qtyByFlavor)
      .filter(([, q]) => (q || 0) > 0)
      .map(([flavorId, qty]) => ({ flavorId, qty }));
  }, [qtyByFlavor]);

  function inc(flavorId: string) {
    if (!size) return;
    if (remaining <= 0) return;

    setQtyByFlavor((prev) => ({ ...prev, [flavorId]: (prev[flavorId] || 0) + 1 }));

    // Premium animation trigger
    setJustAddedId(flavorId);
    window.setTimeout(() => {
      setJustAddedId((cur) => (cur === flavorId ? null : cur));
    }, 650);
  }

  function dec(flavorId: string) {
    setQtyByFlavor((prev) => {
      const next = { ...prev };
      const cur = next[flavorId] || 0;
      if (cur <= 1) delete next[flavorId];
      else next[flavorId] = cur - 1;
      return next;
    });
  }

  function addToCart() {
    if (!size) return;
    if (pickedCount !== size) return;

    const item: CartItem = {
      boxSize: size,
      items: selections,
      price: BOX_PRICES[size],
      createdAt: Date.now(),
    };

    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const current: CartItem[] = Array.isArray(parsed) ? parsed : [];
      localStorage.setItem(CART_KEY, JSON.stringify([item, ...current]));
    } catch {}

    router.push("/cart");
  }

  if (!size) {
    return (
      <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <h1>Build your box</h1>
        <p>Invalid size.</p>
        <Link href="/build" style={{ color: "var(--brand-blue)" }}>
          ← Back to sizes
        </Link>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div style={{ minWidth: 260 }}>
          <h1 style={{ marginBottom: 6 }}>Build your box ✨</h1>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ color: "#444", fontWeight: 900 }}>
              Selected size: <span style={{ color: "rgba(0,0,0,0.85)" }}>Box of {size}</span>
            </div>

            <div
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(0,0,0,0.10)",
                background: remaining === 0 ? "rgba(0,0,0,0.06)" : "rgba(0,0,0,0.03)",
                fontSize: 12,
                fontWeight: 900,
              }}
              title="Remaining picks"
            >
              Remaining: {remaining}
            </div>

            <div style={{ color: "#444", fontSize: 13 }}>
              Price: <strong>IDR {formatIDR(BOX_PRICES[size])}</strong>
            </div>
          </div>

          <div style={{ marginTop: 8, color: "#444" }}>
            Pick <strong>{size}</strong> cookies. Duplicates welcome.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
          <SizeSwitcher current={size} />

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Link
              href="/build"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ddd",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              View all sizes
            </Link>

            <button
              type="button"
              onClick={addToCart}
              disabled={pickedCount !== size}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: "var(--brand-blue)",
                color: "#fff",
                fontWeight: 900,
                cursor: pickedCount === size ? "pointer" : "not-allowed",
                opacity: pickedCount === size ? 1 : 0.6,
              }}
            >
              Add to cart
            </button>
          </div>
        </div>
      </div>

      {/* Flavor grid */}
      <div
        style={{
          marginTop: 18,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        }}
      >
        {FLAVORS.map((f: any) => {
          const q = qtyByFlavor[f.id] || 0;
          const disabledPlus = remaining <= 0;

          return (
            <div
              key={String(f.id)}
              className={`${styles.card} ${justAddedId === f.id ? styles.bump : ""}`}
            >
              {/* Image header */}
              <div className={styles.imageWrap}>
                <div className={styles.shine} />

                {f.image ? (
                  <Image
                    src={String(f.image)}
                    alt={String(f.name)}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    style={{ objectFit: "cover" }}
                    priority={false}
                  />
                ) : (
                  <div
                    style={{
                      height: "100%",
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 900,
                      color: "rgba(0,0,0,0.45)",
                    }}
                  >
                    {String(f.name)}
                  </div>
                )}

                {!!f.badges?.length && (
                  <div className={styles.badges}>
                    {f.badges.slice(0, 2).map((b: any) => (
                      <BadgePill key={String(b)} text={String(b)} />
                    ))}
                  </div>
                )}
              </div>

              {/* Body */}
              <div className={styles.body}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: 16, lineHeight: 1.2 }}>
                      {String(f.name)}
                    </div>

                    {f.description && (
                      <div style={{ marginTop: 6, color: "#444", fontSize: 13, lineHeight: 1.35 }}>
                        {String(f.description)}
                      </div>
                    )}
                  </div>

                  <div
                    className={`${styles.qtyPill} ${justAddedId === f.id ? styles.pulse : ""}`}
                    title="Selected"
                  >
                    {q}
                  </div>
                </div>

                {!!f.tags?.length && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {f.tags.slice(0, 4).map((t: any) => (
                      <TagChip key={String(t)} text={String(t)} />
                    ))}
                  </div>
                )}

                {(f.intensity?.chocolate || f.intensity?.sweetness) && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                      padding: 10,
                      borderRadius: 12,
                      background: "rgba(0,0,0,0.03)",
                      border: "1px solid rgba(0,0,0,0.06)",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Chocolate</div>
                      <Meter value={Number(f.intensity?.chocolate ?? 0)} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Sweetness</div>
                      <Meter value={Number(f.intensity?.sweetness ?? 0)} />
                    </div>
                  </div>
                )}

                {/* Controls */}
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 2 }}>
                  <button
                    type="button"
                    onClick={() => dec(String(f.id))}
                    disabled={q === 0}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      background: "#fff",
                      cursor: q === 0 ? "not-allowed" : "pointer",
                      opacity: q === 0 ? 0.5 : 1,
                      fontWeight: 900,
                      fontSize: 18,
                    }}
                  >
                    −
                  </button>

                  <button
                    type="button"
                    onClick={() => inc(String(f.id))}
                    disabled={disabledPlus}
                    className={`${styles.primaryBtn} ${!disabledPlus ? styles.primaryBtnEnabled : ""}`}
                    style={{
                      flex: 1,
                      height: 40,
                      borderRadius: 12,
                      border: "none",
                      background: "var(--brand-blue)",
                      color: "#fff",
                      fontWeight: 900,
                      cursor: disabledPlus ? "not-allowed" : "pointer",
                      opacity: disabledPlus ? 0.55 : 1,
                    }}
                  >
                    Add +
                  </button>
                </div>
              </div>

              <div className={`${styles.successToast} ${justAddedId === f.id ? styles.showToast : ""}`}>
                Added ✓
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
