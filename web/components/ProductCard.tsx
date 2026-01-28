// web/components/ProductCard.tsx
"use client";

import Image from "next/image";
import styles from "./ProductCard.module.css";

export type FlavorUI = {
  id: string;
  name: string;
  image: string;
  ingredients: string;
  textureTags: string[];
  intensity?: { chocolate?: 0 | 1 | 2 | 3 | 4 | 5; sweetness?: 1 | 2 | 3 | 4 | 5 };
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
}: {
  flavor: FlavorUI;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
  disabledAdd?: boolean;
  addLabel?: string;
}) {
  const chocolate = flavor.intensity?.chocolate ?? 0;
  const sweetness = flavor.intensity?.sweetness ?? 0;

  const isSoldOut = !!flavor.soldOut;
  const addDisabled = !!disabledAdd || isSoldOut;
  const removeDisabled = quantity === 0;

  // ✅ Bulletproof click/tap handler
  const fireAdd = () => {
    if (addDisabled) return;
    onAdd();
  };

  const fireRemove = () => {
    if (removeDisabled) return;
    onRemove();
  };

  return (
    <article className={styles.card}>
      <div className={styles.imageWrap}>
        <Image
          src={flavor.image}
          alt={flavor.name}
          fill
          className={styles.image}
          sizes="(max-width: 768px) 50vw, 25vw"
          priority={false}
        />

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

        <p className={styles.ingredients} title={flavor.ingredients}>
          {flavor.ingredients}
        </p>

        <div className={styles.textureRow}>
          {flavor.textureTags.slice(0, 2).map((t) => (
            <span key={t} className={styles.texturePill}>
              {t}
            </span>
          ))}
        </div>

        {(chocolate > 0 || sweetness > 0) && (
          <div className={styles.intensityWrap}>
            <div className={styles.intensityBlock}>
              <div className={styles.intensityLabel}>Chocolate</div>
              <div className={styles.dots}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <span key={i} className={`${styles.dot} ${i < chocolate ? styles.dotOn : ""}`} />
                ))}
              </div>
            </div>
            <div className={styles.intensityBlock}>
              <div className={styles.intensityLabel}>Sweetness</div>
              <div className={styles.dots}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <span key={i} className={`${styles.dot} ${i < sweetness ? styles.dotOn : ""}`} />
                ))}
              </div>
            </div>
          </div>
        )}

        <div className={styles.ctaRow}>
          <button
            className={styles.minusBtn}
            type="button"
            disabled={removeDisabled}
            onClick={fireRemove}
            onPointerUp={fireRemove}
            aria-label={`Remove ${flavor.name}`}
          >
            –
          </button>

          <button
            className={styles.addBtn}
            type="button"
            disabled={addDisabled}
            onClick={fireAdd}
            onPointerUp={fireAdd}
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
      </div>
    </article>
  );
}
