// web/components/ProductCard.tsx
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
  soldOut?: boolean; // optional
};

export default function ProductCard({
  flavor,
  quantity,
  onAdd,
  onRemove,
  disabledAdd,
}: {
  flavor: FlavorUI;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
  disabledAdd?: boolean;
}) {
  const chocolate = flavor.intensity?.chocolate ?? 0;
  const sweetness = flavor.intensity?.sweetness ?? 0;

  const isSoldOut = !!flavor.soldOut;

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

        {/* Badges */}
        {flavor.badges?.slice(0, 2).map((b, i) => (
          <div key={b} className={styles.badge} style={{ top: 10 + i * 36 }}>
            {b}
          </div>
        ))}

        {/* Sold out overlay label */}
        {isSoldOut && (
          <div className={styles.soldOutBadge}>
            Sold out
          </div>
        )}
      </div>

      <div className={styles.body}>
        {/* Title */}
        <div className={styles.titleRow}>
          <h3 className={styles.title}>{flavor.name}</h3>
        </div>

        {/* Ingredients */}
        <p className={styles.ingredients} title={flavor.ingredients}>
          {flavor.ingredients}
        </p>

        {/* Texture */}
        <div className={styles.textureRow}>
          {flavor.textureTags.slice(0, 2).map((t) => (
            <span key={t} className={styles.texturePill}>
              {t}
            </span>
          ))}
        </div>

        {/* Intensity */}
        {(chocolate > 0 || sweetness > 0) && (
          <div className={styles.intensityWrap}>
            <div className={styles.intensityBlock}>
              <div className={styles.intensityLabel}>Chocolate</div>
              <div className={styles.dots}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className={`${styles.dot} ${i < chocolate ? styles.dotOn : ""}`}
                  />
                ))}
              </div>
            </div>
            <div className={styles.intensityBlock}>
              <div className={styles.intensityLabel}>Sweetness</div>
              <div className={styles.dots}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className={`${styles.dot} ${i < sweetness ? styles.dotOn : ""}`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CTA row */}
        <div className={styles.ctaRow}>
          <button
            className={styles.minusBtn}
            onClick={onRemove}
            disabled={quantity === 0}
            aria-label={`Remove ${flavor.name}`}
            type="button"
          >
            –
          </button>

          <button
            className={styles.addBtn}
            onClick={onAdd}
            disabled={!!disabledAdd || isSoldOut}
            aria-label={`Add ${flavor.name}`}
            type="button"
          >
            <span className={styles.addLabel}>
              {isSoldOut ? "Sold out" : "Add to box"}
            </span>

            <span className={styles.addRight}>
              {/* qty pill moved here */}
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
