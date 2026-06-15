// web/components/SmoothieCard.tsx
"use client";

import Image from "next/image";
import { COLORS } from "@/lib/theme";
import { SMOOTHIE_PRICE, type Smoothie } from "@/lib/smoothies";
import styles from "./SmoothieCard.module.css";

const formatIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export default function SmoothieCard({ item }: { item: Smoothie }) {
  return (
    <article className={styles.card} style={{ opacity: item.soldOut ? 0.55 : 1 }}>
      <div className={styles.imageWrap}>
        {item.image ? (
          <Image
            src={item.image}
            alt={item.name}
            fill
            className={styles.image}
            sizes="(max-width: 768px) 50vw, 320px"
          />
        ) : null}

        {item.badges?.length ? (
          <span
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              padding: "5px 11px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.9)",
              backdropFilter: "blur(6px)",
              border: "1px solid rgba(0,0,0,0.08)",
              color: COLORS.black,
              fontSize: 11.5,
              fontWeight: 800,
            }}
          >
            {item.badges[0]}
          </span>
        ) : null}
      </div>

      <div style={{ padding: "14px 14px 16px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: COLORS.black }}>{item.name}</div>
        {item.description ? (
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, color: COLORS.muted }}>
            {item.description}
          </p>
        ) : null}

        {item.ingredients?.length ? (
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.4, color: "#6b6b6b" }}>
            <span style={{ fontWeight: 750, color: "#4f4f4f" }}>Key ingredients:</span>{" "}
            {item.ingredients.join(" · ")}
          </p>
        ) : null}

        {item.tags?.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {item.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 11.5,
                  padding: "5px 9px",
                  borderRadius: 999,
                  border: "1px solid rgba(0,20,167,0.18)",
                  color: COLORS.blue,
                  background: "rgba(0,20,167,0.05)",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        ) : null}

        <div
          style={{
            marginTop: "auto",
            paddingTop: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontWeight: 850, fontSize: 16, color: COLORS.blue }}>
            {formatIDR(SMOOTHIE_PRICE)}
          </span>
          {item.soldOut ? (
            <span style={{ fontSize: 12, fontWeight: 800, color: COLORS.muted }}>Sold out</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
