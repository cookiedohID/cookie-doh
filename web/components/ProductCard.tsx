// web/components/ProductCard.tsx
import Image from "next/image";
import styles from "./ProductCard.module.css";

export type FlavorUI = {
  id: string;
  name: string;
  image: string;
  ingredients: string; // 🟢
  textureTags: string[]; // 🔵
  intensity?: { chocolate?: 1 | 2 | 3 | 4 | 5; sweetness?: 1 | 2 | 3 | 4 | 5 }; // optional
  price: number;
  badges?: string[];
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
        {flavor.badges?.slice(0, 2).map((b) => (
          <div key={b} className={styles.badge}>
            {b}
          </div>
        ))}
      </div>

      <div className={styles.body}>
        {/* 🔴 Flavor + qty */}
        <div className={styles.redRow}>
          <h3 className={styles.title}>{flavor.name}</h3>
          <div className={styles.qtyPill}>{quantity}</div>
        </div>

        {/* 🟢 Ingredients */}
        <p className={styles.ingredients} title={flavor.ingredients}>
          {flavor.ingredients}
        </p>

        {/* 🔵 Texture */}
        <div className={styles.textureRow}>
          {flavor.textureTags.slice(0, 2).map((t) => (
            <span key={t} className={styles.texturePill}>
              {t}
            </span>
          ))}
        </div>

        {/* Intensity (de-emphasized; still visible, not messy) */}
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
          >
            –
          </button>

          <button
            className={styles.addBtn}
            onClick={onAdd}
            disabled={!!disabledAdd}
            aria-label={`Add ${flavor.name}`}
          >
            Add <span className={styles.plus}>+</span>
          </button>
        </div>
      </div>
    </article>
  );
}
