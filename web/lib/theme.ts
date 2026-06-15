// web/lib/theme.ts
// Single source of truth for Cookie Doh brand styling.
// Keep these in sync with the CSS variables in app/globals.css (:root).

export const COLORS = {
  blue: "#0014A7", // Brand blue (Pantone 293C-ish)
  orange: "#FF5A00", // Accent
  black: "#101010",
  white: "#FFFFFF",
  bg: "#FAF7F2", // Warm off-white page background
  sand: "#FAF7F2", // Alias for `bg` (used across cart/checkout/assortments)
  muted: "#6B6B6B", // Secondary text
} as const;

export const RADIUS = {
  card: 18,
  pill: 999,
} as const;

export const SHADOW = {
  card: "0 10px 26px rgba(0,0,0,0.05)",
  cardHover: "0 18px 40px rgba(0,0,0,0.12)",
  button: "0 10px 22px rgba(0,0,0,0.10)",
} as const;
