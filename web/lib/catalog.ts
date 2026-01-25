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

  // ✅ NEW: Stock / availability (Lock C)
  soldOut?: boolean; // when true => disable add + show "Sold out"
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
    soldOut: false,
  },
  {
    id: "the-other-one",
    name: "The Other One",
    description:
      "Baked with European Butter, Mixed of Dark + Milk Belgian Chocolate, Bourbon Vanilla and Sea Salt Flakes.",
    image: "/flavors/the-other-one.jpg",
    badges: ["Fan Favorite"],
    tags: ["Gooey", "Rich"],
    intensity: { chocolate: 5, sweetness: 4 },
    soldOut: false,
  },
  {
    id: "the-comfort",
    name: "The Comfort",
    description:
      "Hearty oats, plump raisins, and a warm cinnamon hug — chewy, golden and baked with old fashioned love.",
    image: "/flavors/the-comfort.jpg",
    badges: ["Fan Favorite"],
    tags: ["Buttery", "Chewy"],
    intensity: { chocolate: 0, sweetness: 3 },
    soldOut: false,
  },
  {
    id: "matcha-magic",
    name: "Matcha Magic",
    description:
      "Like a serene Japanese garden in cookie form — vibrant matcha, sweet chocolate clouds and pure melt-in-your-mouth magic.",
    image: "/flavors/matcha-magic.jpg",
    badges: ["New"],
    tags: ["Earthy", "Creamy"],
    intensity: { chocolate: 2, sweetness: 3 },
    soldOut: true,
    // soldOut: true, // <- toggle to test sold-out UX
  },
  {
    id: "orange-in-the-dark",
    name: "Orange In The Dark",
    description:
      "Rich, fudgy chocolate cookie packed with dark chocolate chips and a citrusy twist of orange peel — decadence with a zing.",
    image: "/flavors/orange-in-the-dark.jpg",
    badges: ["Limited"],
    tags: ["Bold", "Zesty"],
    intensity: { chocolate: 3, sweetness: 4 },
    soldOut: false,
  },
  // ...your other flavors
];

export const BOX_PRICES: Record<1 | 3 | 6, number> = {
  1: 32500,
  3: 90000,
  6: 180000,
};

export const FREE_SHIPPING_THRESHOLD = 200000;

export function formatIDR(amount: number) {
  return new Intl.NumberFormat("id-ID").format(amount);
}
