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
  price?: number; // not used for box pricing
  badges?: string[];
  soldOut?: boolean; // ✅ Lock C: disable + show "Sold out"
};

const BADGE_PRIORITY = ["Bestseller", "Limited", "New", "Classic"] as const;

function sortBadges(badges: string[] | undefined) {
  if (!badges || badges.length === 0) return [];
  const rank = new Map<string, number>();
  BADGE_PRIORITY.forEach((b, i) => rank.set(b, i));

  return [...badges].sort((a, b) => {
    const ra = rank.has(a) ? (rank.get(a) as number) : 999;
    const rb = rank.has(b) ? (rank.get(b) as number) : 999;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
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
  addLabel?: string; // ✅ lets you reuse card outside Build Box (default: "Add to box")
}) {
  const chocolate = flavor.intensity?.chocolate ?? 0;
  const sweetness = flavor.intensity?.sweetness ?? 0;

  const isSoldOut = !!flavor.soldOut;
  const addDisabled = !!disabledAdd || isSoldOut;
  const removeDisabled = quantity === 0;

  const topBadges = sortBadges(flavor.badges).slice(0, 2);
  const ctaText = addLabel ?? "Add to box";

  return (
    <article
      className={styles.card}
      aria-label={flavor.name}
      style={{ opacity: isSoldOut ? 0.88 : 1 }}
    >
      <div className={styles.imageWrap}>
        <Image
          src={flavor.image}
          alt={flavor.name}
          fill
          className={styles.image}
          sizes="(max-width: 768px) 50vw, 25vw"
          priority={false}
        />

        {/* ✅ Lock C: Sold out label */}
        {isSoldOut && (
          <div
            className={styles.badge}
            style={{
              top: 10,
              left: 10,
              right: "auto",
              background: "rgba(0,0,0,0.75)",
              color: "#fff",
            }}
          >
            Sold out
          </div>
        )}

        {/* Badges (stack vertically so they don't overlap/clamp weirdly) */}
        {topBadges.map((b, i) => (
          <div
            key={b}
            className={styles.badge}
            style={{
              top: 10 + i * 36,
              // if sold out exists, shift badges down so it stays first
              transform: isSoldOut ? "translateY(36px)" : "none",
            }}
          >
            {b}
          </div>
        ))}
      </div>

      <div className={styles.body}>
        {/* Flavor + qty */}
        <div className={styles.redRow}>
          <h3 className={styles.title}>{flavor.name}</h3>
          <div className={styles.qtyPill} aria-label="Selected quantity">
            {quantity}
          </div>
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

        {/* Intensity (smaller, fits box) */}
        {(chocolate > 0 || sweetness > 0) && (
          <div className={styles.intensityWrap}>
            <div className={styles.intensityBlock}>
              <div className={styles.intensityLabel}>Chocolate</div>
              <div className={styles.dots} aria-label={`Chocolate intensity ${chocolate}/5`}>
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
              <div className={styles.dots} aria-label={`Sweetness intensity ${sweetness}/5`}>
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
            disabled={removeDisabled}
            aria-label={`Remove ${flavor.name}`}
          >
            –
          </button>

          <button
            className={styles.addBtn}
            onClick={onAdd}
            disabled={addDisabled}
            aria-label={
              isSoldOut
                ? `${flavor.name} is sold out`
                : `Add ${flavor.name}`
            }
            title={isSoldOut ? "Sold out" : undefined}
          >
            {ctaText} <span className={styles.plus}>+</span>
          </button>
        </div>
      </div>
    </article>
  );
}
