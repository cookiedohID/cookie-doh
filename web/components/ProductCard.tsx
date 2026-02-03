// web/components/ProductCard.tsx

"use client";

import Image from "next/image";
import styles from "./ProductCard.module.css";

export type FlavorUI = {
  id: string;
  name: string;
  image: string;
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
}: {
  flavor: FlavorUI;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
  disabledAdd?: boolean;
  addLabel?: string;
}) {
  const isSoldOut = !!flavor.soldOut;
  const addDisabled = !!disabledAdd || isSoldOut;

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

{/* Tagline */}
<p className={styles.tagline}>
  {flavor.description?.trim() ? flavor.description : "TAGLINE_EMPTY"}
</p>


        {flavor.description ? (
          <p className={styles.description}>{flavor.description}</p>
        ) : null}

<pre style={{ fontSize: 10, color: "red" }}>
  {JSON.stringify(flavor.description)}
</pre>


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
      </div>
    </article>
  );
}
