// web/lib/catalog.ts
console.log(
  "CATALOG CHECK:",
  FLAVORS.map((f) => ({ id: f.id, description: f.description }))
);

export type FlavorBadge =
  | "Bestseller"
  | "Signature"
  | "New"
  | "Limited"
  | "Classic"
  | "Fan Favorite"
  | "House Favorite"
  | "Bold Choice"
  | "Calm Pick"
  | "Romantic"
  | "Crowd Pleaser"
  | "Indulgent"
  | "Comfort Pick"
  | "Late Night Comfort"
  | "Refined"
  | "Bright Finish";

export type FlavorIntensity = {
  chocolate?: number; // 0-5
  sweetness?: number; // 0-5
};

export type Flavor = {
  id: string;
  name: string;
  description?: string;
  image?: string; // e.g. "/flavors/choco-chip.jpg"
  badges?: FlavorBadge[]; // e.g. ["Bestseller", "Signature"]
  tags?: string[]; // e.g. ["Chewy", "Chunky", "Nutty"]
  ingredients?: string[]; // ✅ array to match your data
  intensity?: FlavorIntensity;

  // optional (legacy / compatibility)
  soldOut?: boolean;
};

export const FLAVORS: Flavor[] = [
  // 1) The One
  {
    id: "the-one",
    name: "The One",
    description:
      "Decadent dark chocolate cookie studded with creamy white chocolate chips -- a bold, blissful contrast in every bite.",
    ingredients: [
      "European B
      utter",
      "Indonesian palm sugar",
      "White Belgian chocolate",
      "Bourbon vanilla",
      "Maldon sea salt flakes",
    ],
    image: "/flavors/the-one.jpg",
    badges: ["Bestseller", "Signature"],
    tags: ["Classic", "Buttery", "Comfort"],
    intensity: { chocolate: 4, sweetness: 4 },
  },

  // 2) The Other One
  {
    id: "the-other-one",
    name: "The Other One",
    description:
      "Sinfully rich chocolate cookie loaded with dark + milk chocolate chips -- pure bliss in every bite.",
    ingredients: [
      "European butter",
      "Indonesian palm sugar",
      "Dark + milk Belgian chocolate",
      "Bourbon vanilla",
      "Maldon sea salt flakes",
    ],
    image: "/flavors/the-other-one.jpg",
    badges: ["Fan Favorite"],
    tags: ["Earthy", "Creamy", "Chocolatey"],
    intensity: { chocolate: 5, sweetness: 4 },
  },

  // 3) Orange In The Dark
  {
    id: "orange-in-the-dark",
    name: "Orange In The Dark",
    description:
      "Rich, fudgy chocolate cookie packed with dark chocolate chips and a citrusy twist of orange peel -- decadence with a zing!",
    ingredients: [
      "European butter",
      "French orange peel",
      "Indonesian palm sugar",
      "Dark Belgian chocolate",
      "Bourbon vanilla",
      "Maldon sea salt flakes",
    ],
    image: "/flavors/orange-in-the-dark.jpg",
    badges: ["Bold Choice"],
    tags: ["Citrus", "Dark", "Aromatic"],
    intensity: { chocolate: 5, sweetness: 4 },
  },

  // 4) Matcha Magic
  {
    id: "matcha-magic",
    name: "Matcha Magic",
    description:
      "Like a serene Japanese garden in cookie form : vibrant matcha, sweet chocolate clouds, and pure melt-in-your-mouth magic.",
    ingredients: [
      "European butter",
      "Japanese matcha (ceremonial grade)",
      "Indonesian palm sugar",
      "White Belgian chocolate",
      "Bourbon vanilla",
    ],
    image: "/flavors/matcha-magic.jpg",
    badges: ["House Favorite"],
    tags: ["Earthy", "Aromatic", "Creamy"],
    intensity: { chocolate: 2, sweetness: 4 },
  },

  // 5) Lavender Hush
  {
    id: "lavender-hush",
    name: "Lavender Hush",
    description:
      "Like a cookie version of fairy tale : floral lavender whispers, creamy chocolate, and a crumb so tender it’s practically pixie made.",
    ingredients: [
      "European butter",
      "Dried lavender flower",
      "White Belgian chocolate",
      "Bourbon vanilla",
    ],
    image: "/flavors/lavender-hush.jpg",
    badges: ["Calm Pick"],
    tags: ["Floral", "Soft", "Elegant"],
    intensity: { chocolate: 2, sweetness: 4 },
  },

  // 6) Rose Lullaby
  {
    id: "rose-lullaby",
    name: "Rose Lullaby",
    description:
      "Fragrant rose petals and warm vanilla, cradling a custard center that melts into memory.",
    ingredients: [
      "European Butter",
      "Dried Rose Petals",
      "Creamy vanilla crème pâtissière",
      "White Belgian Chocolate",
      "Bourbon Vanilla",
    ],
    image: "/flavors/rose-lullaby.jpg",
    badges: ["Romantic"],
    tags: ["Floral", "Creamy", "Nostalgic"],
    intensity: { chocolate: 1, sweetness: 4 },
  },

  // 7) Strawberry Kiss
  {
    id: "strawberry-kiss",
    name: "Strawberry Kiss",
    description:
      "Sweet strawberries drift through creamy white chocolate, soft as a blush and lingering like a first kiss.",
    ingredients: [
      "European butter",
      "Freeze-dried strawberry",
      "White Belgian chocolate",
      "Bourbon vanilla",
    ],
    image: "/flavors/strawberry-kiss.jpg",
    badges: ["Crowd Pleaser"],
    tags: ["Fruity", "Sweet", "Romantic"],
    intensity: { chocolate: 2, sweetness: 4 },
  },

  // 8) Crimson Crush
  {
    id: "crimson-crush",
    name: "Crimson Crush",
    description:
      "Sweet strawberries sink into deep milk chocolate, rich and lingering, like a kiss remembered long after.",
    ingredients: [
      "European butter",
      "Freeze-dried strawberry",
      "Indonesian palm sugar",
      "Milk + dark Belgian chocolate",
      "Bourbon vanilla",
    ],
    image: "/flavors/crimson-crush.jpg",
    badges: ["Indulgent"],
    tags: ["Fruity", "Dark", "Rich"],
    intensity: { chocolate: 4, sweetness: 4 },
  },

  // 9) Velvety Red
  {
    id: "velvety-red",
    name: "Velvety Red",
    description:
      "Velvety red cocoa cookie swirled with tangy cream cheese - bold, creamy and utterly irresistible.",
    ingredients: [
      "European butter",
      "Cream cheese",
      "Indonesian palm sugar",
      "White Belgian chocolate",
      "Bourbon vanilla",
      "Maldon sea salt flakes",
    ],
    image: "/flavors/velvety-red.jpg",
    badges: ["Comfort Pick"],
    tags: ["Creamy", "Rich", "Indulgent"],
    intensity: { chocolate: 3, sweetness: 4 },
  },

  // 10) Midnight Crave
  {
    id: "midnight-crave",
    name: "Midnight Crave",
    description:
      "Soft, buttery oat cookie with caramelized raisins, kissed with cinnamon and brown sugar warmth - indulgence after dark.",
    ingredients: [
      "European butter",
      "Oatmeal",
      "Californian raisin",
      "Cinnamon",
      "Indonesian palm sugar",
      "Bourbon vanilla",
      "Maldon sea salt flakes",
    ],
    image: "/flavors/midnight-crave.jpg",
    badges: ["Late Night Comfort"],
    tags: ["Comfort", "Spiced", "Nostalgic"],
    intensity: { chocolate: 0, sweetness: 3 },
  },

  // 11) One Shade of Grey
  {
    id: "one-shade-of-grey",
    name: "One Shade of Grey",
    description:
      "Like a cozy London cafe in every bite : bold bergamot, sweet milk chocolate and butter softness. ~ Earl Grey.",
    ingredients: [
      "European butter",
      "Earl Grey tea",
      "Indonesian palm sugar",
      "Milk Belgian chocolate",
      "Bourbon vanilla",
    ],
    image: "/flavors/one-shade-of-grey.jpg",
    badges: ["Refined"],
    tags: ["Tea", "Elegant", "Balanced"],
    intensity: { chocolate: 2, sweetness: 3 },
  },

  // 12) Ruby Glow
  {
    id: "ruby-glow",
    name: "Ruby Glow",
    description:
      "Buttery cookie with creamy white chocolate and bursts of cranberry - a little glow in every bite.",
    ingredients: [
      "European butter",
      "USA cranberry",
      "Indonesian palm sugar",
      "White Belgian chocolate",
      "Bourbon vanilla",
      "Maldon sea salt flakes",
    ],
    image: "/flavors/ruby-glow.jpg",
    badges: ["Bright Finish"],
    tags: ["Fruity", "Fresh", "Uplifting"],
    intensity: { chocolate: 2, sweetness: 4 },
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
