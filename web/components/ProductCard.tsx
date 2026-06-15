// web/components/ProductCard.tsx

"use client";

import Image from "next/image";
import styles from "./ProductCard.module.css";

export type FlavorUI = {
  id: string;
  name: string;
  image: string;
  image2?: string;          // optional second photo shown on hover
  description?: string;     // ✅ add this
  ingredients?: string[];
  textureTags: string[];
  // intensity intentionally kept optional for future use,
  // but NOT rendered in UI
  intensity?: {
    chocolate?: 0 | 1 | 2 | 3 | 4 | 5;
    sweetness?: 1 | 2 | 3 | 4 | 5;
  };
  price?: number;
  badges?: string[];
  soldOut?: boolean;
};

export default function ProductCard({
  flavor,
  quantity,
  onAdd,
  onRemove,
  disabledAdd,
  addLabel,
  showQty = true,
}: {
  flavor: FlavorUI;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
  disabledAdd?: boolean;
  addLabel?: string;
  /** When false, render a single full-width action button with no qty controls
   *  (used on the homepage where the card just links to /build). */
  showQty?: boolean;
}) {
  const isSoldOut = !!flavor.soldOut;
  const addDisabled = !!disabledAdd || isSoldOut;

  return (
    <article className={styles.card}>
      <div
        className={`${styles.imageWrap} ${flavor.image2 ? styles.hasSecond : ""}`}
      >
        <Image
          src={flavor.image}
          alt={flavor.name}
          fill
          className={styles.image}
          sizes="(max-width: 768px) 50vw, 25vw"
          priority={false}
        />

        {flavor.image2 && (
          <Image
            src={flavor.image2}
            alt=""
            aria-hidden
            fill
            className={styles.imageSecond}
            sizes="(max-width: 768px) 50vw, 25vw"
            priority={false}
          />
        )}

        {flavor.badges?.slice(0, 2).map((b, i) => (
          <div key={b} className={styles.badge} style={{ top: 10 + i * 36 }}>
            {b}
          </div>
        ))}

        {isSoldOut && <div className={styles.soldOutBadge}>Sold out</div>}
      </div>

      <div className={styles.body}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>{flavor.name}</h3>
        </div>

{/* Tagline (only when there's a description — avoids a blank gap) */}
{flavor.description?.trim() ? (
  <p className={styles.tagline}>{flavor.description}</p>
) : null}

        {/* Ingredients line */}
      {flavor.ingredients?.length ? (
        <p className={styles.ingredients}>
          <span className={styles.ingredientsLabel}>Key ingredients:</span>{" "}
          {flavor.ingredients.join(" · ")}
        </p>
      ) : null}


        {/* Texture tags */}
        <div className={styles.textureRow}>
          {flavor.textureTags.slice(0, 2).map((t) => (
            <span key={t} className={styles.texturePill}>
              {t}
            </span>
          ))}
        </div>

        {/* CTA */}
        {showQty ? (
          <div className={styles.ctaRow}>
            <button
              className={styles.minusBtn}
              type="button"
              onClick={onRemove}
              disabled={quantity === 0}
              aria-label={`Remove ${flavor.name}`}
            >
              –
            </button>

            <button
              className={styles.addBtn}
              type="button"
              onClick={onAdd}
              disabled={addDisabled}
              aria-label={`Add ${flavor.name}`}
            >
              <span className={styles.addLabel}>
                {addLabel ? addLabel : isSoldOut ? "Sold out" : "Add to box"}
              </span>

              <span className={styles.addRight}>
                <span className={styles.qtyPillNew} aria-label="Selected count">
                  {quantity}
                </span>
                {!isSoldOut && <span className={styles.plus}>+</span>}
              </span>
            </button>
          </div>
        ) : (
          <div className={styles.ctaRow}>
            <button
              className={`${styles.addBtn} ${styles.addBtnFull}`}
              type="button"
              onClick={onAdd}
              disabled={addDisabled}
              aria-label={`${addLabel ?? "Build a box"} — ${flavor.name}`}
            >
              <span className={styles.addLabelCentered}>
                {isSoldOut ? "Sold out" : addLabel ?? "Build a box"}
              </span>
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
