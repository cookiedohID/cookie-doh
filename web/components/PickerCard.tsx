"use client";

// web/components/PickerCard.tsx — the standardized item picker card used across the
// web build-a-box and bundle builder (and matching the POS cards):
//   • tap the image → detail view (ingredients + allergens)
//   • top-right shows a quantity counter once added (an ⓘ hint otherwise)
//   • blue frame when the item is in the selection
//   • a − qty + stepper
import Image from "next/image";
import { COLORS } from "@/lib/theme";

const formatIDR = (n: number) => `Rp ${Number(n).toLocaleString("id-ID")}`;

export default function PickerCard({
  name,
  image,
  price,
  qty,
  badge,
  atMax,
  soldOut,
  onInc,
  onDec,
  onOpenDetail,
  sizes = "200px",
}: {
  name: string;
  image?: string;
  price?: number;
  qty: number;
  badge?: string;
  atMax?: boolean;
  soldOut?: boolean;
  onInc: () => void;
  onDec: () => void;
  onOpenDetail: () => void;
  sizes?: string;
}) {
  return (
    <div style={{ border: qty > 0 ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.10)", borderRadius: 16, background: "#fff", display: "flex", flexDirection: "column", overflow: "hidden", opacity: soldOut ? 0.55 : 1 }}>
      <button
        type="button"
        onClick={onOpenDetail}
        aria-label={`${name} — details`}
        style={{ position: "relative", width: "100%", aspectRatio: "1/1", background: COLORS.sand, border: "none", padding: 0, cursor: "pointer", display: "block" }}
      >
        {image ? <Image src={image} alt={name} fill style={{ objectFit: "cover" }} sizes={sizes} /> : null}
        {badge ? <span style={{ position: "absolute", top: 8, left: 8, padding: "4px 9px", borderRadius: 999, background: "rgba(255,255,255,0.92)", color: "#111", fontWeight: 800, fontSize: 11, boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}>{badge}</span> : null}
        {qty > 0
          ? <span style={{ position: "absolute", top: 8, right: 8, minWidth: 26, height: 26, padding: "0 7px", borderRadius: 999, background: COLORS.blue, color: "#fff", fontWeight: 900, fontSize: 14, display: "grid", placeItems: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }}>{qty}</span>
          : <span aria-hidden style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: 999, background: "rgba(255,255,255,0.92)", color: COLORS.blue, fontWeight: 900, fontSize: 13, display: "grid", placeItems: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}>ⓘ</span>}
      </button>
      <div style={{ padding: "8px 10px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        <button type="button" onClick={onOpenDetail} style={{ textAlign: "left", border: "none", background: "none", padding: 0, cursor: "pointer", fontWeight: 800, fontSize: 13.5, color: COLORS.black, lineHeight: 1.2, minHeight: 34 }}>{name}</button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          {typeof price === "number" ? <span style={{ fontWeight: 800, color: COLORS.blue, fontSize: 13 }}>{formatIDR(price)}</span> : <span />}
          {soldOut ? (
            <span style={{ fontSize: 11.5, fontWeight: 800, color: "#6B6B6B" }}>Sold out</span>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button type="button" onClick={onDec} disabled={qty === 0} aria-label={`Remove one ${name}`} style={{ width: 30, height: 30, borderRadius: 999, border: `1px solid ${COLORS.blue}`, background: "#fff", color: COLORS.blue, fontWeight: 900, fontSize: 16, lineHeight: 1, cursor: qty === 0 ? "not-allowed" : "pointer", opacity: qty === 0 ? 0.4 : 1 }}>–</button>
              <span style={{ fontWeight: 800, fontSize: 14, minWidth: 14, textAlign: "center" }}>{qty}</span>
              <button type="button" onClick={onInc} disabled={!!atMax} aria-label={`Add one ${name}`} style={{ width: 30, height: 30, borderRadius: 999, border: "none", background: COLORS.blue, color: "#fff", fontWeight: 900, fontSize: 16, lineHeight: 1, cursor: atMax ? "not-allowed" : "pointer", opacity: atMax ? 0.4 : 1 }}>+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
