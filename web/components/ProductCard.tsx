// web/components/ProductCard.tsx
import Image from "next/image";
import styles from "./ProductCard.module.css";

export type FlavorUI = {
  id: string;
  name: string;
  image: string;
  ingredients: string;
  textureTags: string[];
  intensity?: {
    chocolate?: 0 | 1 | 2 | 3 | 4 | 5;
    sweetness?: 1 | 2 | 3 | 4 | 5;
  };
  price?: number;
  badges?: string[];
  soldOut?: boolean;
};

const BADGE_PRIORITY = ["Bestseller", "Limited", "New", "Classic", "Fan Favorite"] as const;

function sortBadges(badges: string[] | undefined) {
  if (!badges) return [];
  const rank = new Map<string, number>();
  BADGE_PRIORITY.forEach((b, i) => rank.set(b, i));
  return [...badges].sort((a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99));
}

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

  const topBadges = sortBadges(flavor.badges).slice(0, 2);
  const ctaText = addLabel ?? "Add to box";

  return (
    <article className={styles.card} style={{ opacity: isSoldOut ? 0.85 : 1 }}>
      <div className={styles.imageWrap}>
        <Image
          src={flavor.image}
          alt={flavor.name}
          fill
          className={styles.image}
          sizes="(max-width: 768px) 50vw, 25vw"
        />

        {/* SOLD OUT overlay */}
        {isSoldOut && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              display: "grid",
              placeItems: "center",
              zIndex: 2,
            }}
          >
            <div
              style={{
                padding: "10px 18px",
                borderRadius: 999,
                background: "rgba(0,0,0,0.75)",
                color: "#fff",
                fontWeight: 950,
                letterSpacing: "0.12em",
                fontSize: 14,
              }}
            >
              SOLD OUT
            </div>
          </div>
        )}

        {/* Badges */}
        {!isSoldOut &&
          topBadges.map((b, i) => (
            <div
              key={b}
              className={styles.badge}
              style={{ top: 10 + i * 36 }}
            >
              {b}
            </div>
          ))}
      </div>

      <div className={styles.body}>
        {/* Title only (quantity removed from here) */}
        <h3 className={styles.title}>{flavor.name}</h3>

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
            disabled={addDisabled}
            aria-label={isSoldOut ? "Sold out" : `Add ${flavor.name}`}
          >
            {ctaText}
            <span className={styles.plus}>+</span>

            {/* ✅ Quantity now lives HERE */}
            {quantity > 0 && (
              <span
                style={{
                  marginLeft: 6,
                  minWidth: 22,
                  height: 22,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.2)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                {quantity}
              </span>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
