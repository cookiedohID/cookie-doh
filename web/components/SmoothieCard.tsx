// web/components/SmoothieCard.tsx
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { COLORS } from "@/lib/theme";
import { SMOOTHIE_PRICE, type Smoothie } from "@/lib/smoothies";
import { addUpsellSingle, decUpsellSingle, getCart, looseSingleQty } from "@/lib/cart";
import styles from "./SmoothieCard.module.css";

export default function SmoothieCard({ item }: { item: Smoothie }) {
  // Reflect how many of THIS smoothie are already in the cart, so the customer
  // can see + adjust the quantity instead of blindly re-adding.
  const [qty, setQty] = useState(0);
  useEffect(() => {
    setQty(looseSingleQty(getCart(), String(item.id), SMOOTHIE_PRICE));
  }, [item.id]);
  function inc() {
    addUpsellSingle({ id: String(item.id), name: String(item.name), price: SMOOTHIE_PRICE, image: item.image, kind: "drink" });
    setQty((q) => q + 1);
  }
  function dec() {
    decUpsellSingle({ id: String(item.id), price: SMOOTHIE_PRICE });
    setQty((q) => Math.max(0, q - 1));
  }
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

      <div style={{ padding: "11px 12px 12px", display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 15.5, color: COLORS.black, lineHeight: 1.2 }}>{item.name}</div>
        {item.description ? (
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.4, color: COLORS.muted, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {item.description}
          </p>
        ) : null}

        {item.ingredients?.length ? (
          <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.4, color: "#6b6b6b", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            <span style={{ fontWeight: 750, color: "#4f4f4f" }}>Key ingredients:</span>{" "}
            {item.ingredients.join(" · ")}
          </p>
        ) : null}

        <div style={{ marginTop: "auto", paddingTop: 8 }}>
          {item.soldOut ? (
            <span style={{ fontSize: 12, fontWeight: 800, color: COLORS.muted }}>Sold out</span>
          ) : qty > 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
              <button type="button" onClick={dec} aria-label="Remove one" style={{ width: 34, height: 34, borderRadius: 999, border: `1px solid ${COLORS.blue}`, background: "#fff", color: COLORS.blue, fontWeight: 900, fontSize: 18, lineHeight: 1, cursor: "pointer" }}>−</button>
              <span style={{ minWidth: 16, textAlign: "center", fontWeight: 900, fontSize: 16, color: COLORS.black }}>{qty}</span>
              <button type="button" onClick={inc} aria-label="Add one" style={{ width: 34, height: 34, borderRadius: 999, border: "none", background: COLORS.blue, color: "#fff", fontWeight: 900, fontSize: 18, lineHeight: 1, cursor: "pointer" }}>＋</button>
            </div>
          ) : (
            <button type="button" onClick={inc} style={{ width: "100%", border: "none", borderRadius: 999, padding: "10px 18px", fontWeight: 900, fontSize: 14, cursor: "pointer", background: COLORS.blue, color: "#fff" }}>Add</button>
          )}
        </div>
      </div>
    </article>
  );
}
