"use client";

// web/components/ItemDetailModal.tsx — standardized item detail (image + ingredients
// + allergens) shown when a picker card image is tapped. Matches the POS detail modal.
import Image from "next/image";
import { COLORS } from "@/lib/theme";

const formatIDR = (n: number) => `Rp ${Number(n).toLocaleString("id-ID")}`;

export type DetailItem = {
  name: string;
  image?: string;
  price?: number;
  description?: string;
  ingredients?: string[];
  allergens?: string;
};

export default function ItemDetailModal({
  item,
  onClose,
  actionLabel,
  onAction,
  actionDisabled,
}: {
  item: DetailItem;
  onClose: () => void;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, maxWidth: 420, width: "100%", maxHeight: "88vh", overflow: "auto" }}>
        <div style={{ position: "relative", width: "100%", aspectRatio: "1/1", background: "#fff" }}>
          {item.image ? <Image src={item.image} alt={item.name} fill style={{ objectFit: "contain" }} sizes="420px" /> : null}
          <button onClick={onClose} aria-label="Close" style={{ position: "absolute", top: 10, right: 10, width: 32, height: 32, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.95)", fontWeight: 900, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: COLORS.black }}>{item.name}</h3>
            {typeof item.price === "number" ? <span style={{ fontWeight: 800, color: COLORS.blue }}>{formatIDR(item.price)}</span> : null}
          </div>
          {item.description ? <p style={{ color: "#6B6B6B", fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>{item.description}</p> : null}
          {item.ingredients?.length ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: COLORS.black, marginBottom: 6 }}>Ingredients</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {item.ingredients.map((ing) => (
                  <span key={ing} style={{ fontSize: 12, fontWeight: 700, color: COLORS.black, background: "#FAF7F2", borderRadius: 999, padding: "4px 10px" }}>{ing}</span>
                ))}
              </div>
            </div>
          ) : null}
          {item.allergens ? (
            <div style={{ marginTop: 12, background: "#fff4cc", border: "1px solid #e6c200", borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontWeight: 800, fontSize: 12.5, color: "#7a5c00" }}>⚠️ Allergens</div>
              <div style={{ fontSize: 12.5, color: "#7a5c00", marginTop: 2 }}>{item.allergens}</div>
            </div>
          ) : null}
          {actionLabel && onAction ? (
            <button onClick={onAction} disabled={actionDisabled} style={{ marginTop: 16, width: "100%", height: 48, borderRadius: 999, border: "none", background: COLORS.blue, color: "#fff", fontWeight: 900, fontSize: 15, cursor: actionDisabled ? "not-allowed" : "pointer", opacity: actionDisabled ? 0.5 : 1 }}>{actionLabel}</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
