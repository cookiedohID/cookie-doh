export type Flavor = {
  id: string;
  name: string;
  badge?: "best" | "limited";
};

export const FLAVORS: Flavor[] = [
  { id: "the-one", name: "The One", badge: "best" },
  { id: "the-other-one", name: "The Other One", badge: "best" },
  { id: "matcha-magic", name: "Matcha Magic", badge: "best" },
  { id: "the-comfort", name: "The Comfort" },
  { id: "midnight-crave", name: "Midnight Crave" },
  { id: "orange-in-the-dark", name: "Orange In The Dark" },
  { id: "ruby-glow", name: "Ruby Glow", badge: "limited" }, // hidden by default in builder
];

export const BOX_PRICES: Record<number, number> = {
  1: 32500,
  3: 90000,
  6: 180000,
};

export const FREE_SHIPPING_THRESHOLD = 200000;

export function formatIDR(amount: number) {
  return new Intl.NumberFormat("id-ID").format(amount);
}
