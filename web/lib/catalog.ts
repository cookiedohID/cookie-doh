// web/lib/catalog.ts

export type FlavorBadge = "Bestseller" | "New" | "Limited" | "Classic" | "Fan Favorite";

export type Flavor = {
  id: string;
  name: string;
  description?: string;

  image?: string; // e.g. "/flavors/choco-chip.jpg"
  badges?: FlavorBadge[]; // e.g. ["Bestseller", "Classic"]
  tags?: string[]; // e.g. ["Chewy", "Chunky", "Nutty"]
  intensity?: {
    chocolate?: 0 | 1 | 2 | 3 | 4 | 5;
    sweetness?: 1 | 2 | 3 | 4 | 5;
  };

  // optional (legacy / compatibility)
  soldOut?: boolean;
};

export const FLAVORS: Flavor[] = [
  {
    id: "the-one",
    name: "The One",
    description:
      "Baked with European Butter, White Belgian Chocolate, Extra Dark Cocoa, Bourbon Vanilla and Sea Salt Flakes.",
    image: "/flavors/the-one.jpg",
    badges: ["Bestseller", "Classic"],
    tags: ["Soft", "Chewy"],
    intensity: { chocolate: 5, sweetness: 3 },
  },
  {
    id: "the-other-one",
    name: "The Other One",
    description:
      "Baked with European Butter, Mixed of Dark + Milk Belgian Chocolate, Bourbon Vanilla and Sea Salt Flakes.",
    image: "/flavors/the-other-one.jpg",
    badges: ["Fan Favorite"],
    tags: ["Earthy", "Creamy"],
    intensity: { chocolate: 5, sweetness: 4 },
  },
  {
    id: "midnight-crave",
    name: "Midnight Crave",
    description:
      "Soft, buttery oat cookie with caramelized raisins, kissed with cinnamon and brown sugar warmth - indulgence after dark.",
    image: "/flavors/midnight-crave.jpg",
    badges: ["Fan Favorite"],
    tags: ["Cozy", "Chewy"],
    intensity: { chocolate: 0, sweetness: 3 },
  },
  {
    id: "matcha-magic",
    name: "Matcha Magic",
    description:
      "A dreamy matcha cookie with sweet creamy notes — soft, fragrant, and quietly addictive.",
    image: "/flavors/matcha-magic.jpg",
    badges: ["Fan Favorite"],
    tags: ["Earthy", "Creamy"],
    intensity: { chocolate: 2, sweetness: 2 },
  },
  {
    id: "orange-in-the-dark",
    name: "Orange In The Dark",
    description:
      "Rich, fudgy chocolate cookie packed with dark chocolate chips and a citrusy twist of orange peel.",
    image: "/flavors/orange-in-the-dark.jpg",
    badges: ["Fan Favorite"],
    tags: ["Bold", "Zesty"],
    intensity: { chocolate: 4, sweetness: 4 },
  },

  // ✅ NEW FLAVORS (placeholders — you can edit anytime)
  {
    id: "ruby-glow",
    name: "Ruby Glow",
    description:
      "Buttery cookie with creamy white chocolate and bursts of cranberry - a little glow in every bite.",
    image: "/flavors/ruby-glow.jpg",
    badges: ["New"],
    tags: ["Fruity", "Buttery"],
    intensity: { chocolate: 1, sweetness: 4 },
  },
  {
    id: "velvety-heart",
    name: "Velvety Heart",
    description:
      "Velvety red cocoa cookie swirled with tangy cream cheese - bold, creamy and utterly irresistable.",
    image: "/flavors/velvety-heart.jpg",
    badges: ["New"],
    tags: ["Soft", "Creamy"],
    intensity: { chocolate: 2, sweetness: 4 },
  },
  {
    id: "one-shade-of-grey",
    name: "One Shade of Grey",
    description:
      "Like a cozy London cafe in every bite : bold bergamot, sweet milk chocolate and butter softness. ~ Earl Grey",
    image: "/flavors/one-shade-of-grey.jpg",
    badges: ["New"],
    tags: ["Aromatic", "Elegant"],
    intensity: { chocolate: 0, sweetness: 3 },
  },
  {
    id: "my-sweet-lavender",
    name: "My Sweet Lavender",
    description:
      "Like a cookie version of fairy tales : floral lavender whispers, creamy chocolate and a crumb so tender it's practically a pixie made.",
    image: "/flavors/my-sweet-lavender.jpg",
    badges: ["New"],
    tags: ["Floral", "Soft"],
    intensity: { chocolate: 0, sweetness: 4 },
  },
  {
    id: "strawberry-kiss",
    name: "Strawberry Kiss",
    description:
      "Blush-sweet strawberries folded into white chocolate, baked soft as a love spell.",
    image: "/flavors/strawberry-kiss.jpg",
    badges: ["New"],
    tags: ["Fruity", "Bright"],
    intensity: { chocolate: 0, sweetness: 4 },
  },
];

export const BOX_PRICES: Record<3 | 6, number> = {
  3: 90000,
  6: 180000,
};

export const FREE_SHIPPING_THRESHOLD = 200000;

export function formatIDR(amount: number) {
  return new Intl.NumberFormat("id-ID").format(amount);
}
