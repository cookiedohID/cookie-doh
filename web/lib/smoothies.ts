// web/lib/smoothies.ts
//
// Cookie Doh Blend — smoothies / drinks menu (display-only for now, no checkout).
// All blends: one size, Rp 39,000. Base varies (yoghurt / sorbet / ice cream).
// Keywords, ingredients & taglines are owner-provided.

export const SMOOTHIE_PRICE = 39000;

export const SMOOTHIE_CATEGORIES = [
  "Berries",
  "Tropical",
  "Cookie Blends",
] as const;

export type SmoothieCategory = (typeof SMOOTHIE_CATEGORIES)[number];

export type Smoothie = {
  id: string;
  name: string;
  category: SmoothieCategory;
  description?: string; // brand tagline
  ingredients?: string[];
  tags?: string[]; // keyword pills
  image?: string; // e.g. "/smoothies/berry-bloom.png"
  badges?: string[];
  soldOut?: boolean;
};

// One short tagline per category, shown under the category heading.
export const CATEGORY_TAGLINES: Record<SmoothieCategory, string> = {
  Berries: "Bursting with antioxidant goodness",
  Tropical: "Love life & chill",
  "Cookie Blends": "Cookie-infused house blends",
};

export const SMOOTHIES: Smoothie[] = [
  // ---- Berries ----
  {
    id: "berry-bloom",
    name: "Berry Bloom",
    category: "Berries",
    description:
      "Layers of vibrant berries unfolding into a bright and creamy daydream.",
    ingredients: ["Strawberry", "Raspberry", "Blueberry", "Apple", "Yoghurt"],
    tags: ["Berry", "Vibrant", "Fruity"],
    image: "/smoothies/berry-bloom.png",
  },
  {
    id: "berry-spell",
    name: "Berry Spell",
    category: "Berries",
    description:
      "Strawberries, raspberries and creamy yoghurt woven into a little sip of magic.",
    ingredients: ["Strawberry", "Raspberry", "Banana", "Green Apple", "Yoghurt"],
    tags: ["Berry", "Creamy", "Refreshing"],
    image: "/smoothies/berry-spell.png",
  },
  {
    id: "blue-moon",
    name: "Blue Moon",
    category: "Berries",
    description:
      "Blueberries and sweet fruit swirled into a dreamy, moonlit blend.",
    ingredients: ["Blueberry", "Banana", "Apple", "Yoghurt"],
    tags: ["Blueberry", "Smooth", "Dreamy"],
    image: "/smoothies/blue-moon.png",
  },
  {
    id: "midnight-berry",
    name: "Midnight Berry",
    category: "Berries",
    description:
      "Dark berries and creamy yoghurt tangled in a rich, velvety escape.",
    ingredients: ["Blackberry", "Blueberry", "Raspberry", "Apple", "Yoghurt"],
    tags: ["Mixed Berry", "Rich", "Bold"],
    image: "/smoothies/midnight-berry.png",
  },
  {
    id: "pink-stardust",
    name: "Pink Stardust",
    category: "Berries",
    description:
      "Bright berries and sparkling citrus scattered with a little stardust.",
    ingredients: ["Strawberry", "Raspberry", "Lemon", "Apple", "Sorbet"],
    tags: ["Berry", "Citrus", "Sparkling"],
    image: "/smoothies/pink-stardust.png",
  },
  {
    id: "ruby-glow",
    name: "Ruby Glow",
    category: "Berries",
    description:
      "Bright berries and crisp apple bursting with a radiant, ruby-red charm.",
    ingredients: ["Strawberry", "Cranberry", "Apple", "Yoghurt"],
    tags: ["Berry", "Tart", "Refreshing"],
    image: "/smoothies/ruby-glow.png",
    badges: ["Best Seller"],
  },
  {
    id: "strawberry-kiss",
    name: "Strawberry Kiss",
    category: "Berries",
    description:
      "Sweet strawberries and creamy banana finished with a playful blush.",
    ingredients: ["Strawberry", "Banana", "Apple", "Yoghurt"],
    tags: ["Strawberry", "Sweet", "Classic"],
    image: "/smoothies/strawberry-kiss.png",
  },

  // ---- Tropical ----
  {
    id: "dragon-dream",
    name: "Dragon Dream",
    category: "Tropical",
    description:
      "Vibrant dragon fruit and golden mango drifting through a tropical fantasy.",
    ingredients: ["Dragon Fruit", "Mango", "Yoghurt"],
    tags: ["Dragon Fruit", "Tropical", "Exotic"],
    image: "/smoothies/dragon-dream.png",
  },
  {
    id: "golden-glow",
    name: "Golden Glow",
    category: "Tropical",
    description:
      "Sun-ripened mangoes and a sparkle of citrus, blended into pure liquid sunshine.",
    ingredients: ["Mango", "Apple", "Lemon", "Yoghurt"],
    tags: ["Mango", "Citrus", "Bright"],
    image: "/smoothies/golden-glow.png",
  },
  {
    id: "island-daydream",
    name: "Island Daydream",
    category: "Tropical",
    description:
      "Juicy watermelon and delicate lychee drifting through a tropical escape.",
    ingredients: ["Watermelon", "Lychee", "Sorbet"],
    tags: ["Watermelon", "Lychee", "Cooling"],
    image: "/smoothies/island-daydream.png",
  },
  {
    id: "mango-tango",
    name: "Mango Tango",
    category: "Tropical",
    description:
      "Sun-ripened mangoes dancing through a frosty tropical escape.",
    ingredients: ["Harum Manis Mango", "Apple Juice", "Sorbet"],
    tags: ["Mango", "Fruity", "Refreshing"],
    image: "/smoothies/mango-tango.png",
  },
  {
    id: "sunbeam",
    name: "Sunbeam",
    category: "Tropical",
    description:
      "Sweet mango, creamy banana and a kiss of citrus in every golden sip.",
    ingredients: ["Mango", "Banana", "Apple", "Lemon", "Yoghurt"],
    tags: ["Mango", "Citrus", "Creamy"],
    image: "/smoothies/sunbeam.png",
  },
  {
    id: "tropical-bliss",
    name: "Tropical Bliss",
    category: "Tropical",
    description:
      "Golden mangoes and creamy banana drifting through a tropical escape.",
    ingredients: ["Mango", "Banana", "Sorbet"],
    tags: ["Mango", "Banana", "Tropical"],
    image: "/smoothies/tropical-bliss.png",
  },

  // ---- Cookie Blends ----
  {
    id: "cookie-crush",
    name: "Cookie Crush",
    category: "Cookie Blends",
    description:
      "Caramel swirls, molten chocolate and a cookie worth falling for.",
    ingredients: ["Cookie", "Milk Chocolate", "Brown Sugar", "Sea Salt", "Caramel Ice Cream"],
    tags: ["Cookie", "Chocolate", "Caramel"],
    image: "/smoothies/cookie-crush.png",
    badges: ["Signature"],
  },
  {
    id: "dark-temptation",
    name: "Dark Temptation",
    category: "Cookie Blends",
    description:
      "Rich cocoa, dark chocolate and tart raspberries made for sweet surrender.",
    ingredients: ["Raspberry", "Dark Chocolate", "Cocoa", "Coconut Milk", "Caramel Ice Cream"],
    tags: ["Chocolate", "Raspberry", "Decadent"],
    image: "/smoothies/dark-temptation.png",
  },
  {
    id: "monkey-business",
    name: "Monkey Business",
    category: "Cookie Blends",
    description:
      "Bananas, chocolate and cookie crumbs getting up to no good.",
    ingredients: ["Banana", "Cookie", "Milk Chocolate", "Caramel Ice Cream"],
    tags: ["Banana", "Chocolate", "Cookie"],
    image: "/smoothies/monkey-business.png",
  },
  {
    id: "sweet-talker",
    name: "Sweet Talker",
    category: "Cookie Blends",
    description:
      "Strawberries, banana and caramel saying all the right things, one sip at a time.",
    ingredients: ["Strawberry", "Banana", "Caramel Ice Cream"],
    tags: ["Strawberry", "Caramel", "Creamy"],
    image: "/smoothies/sweet-talker.png",
  },
];
