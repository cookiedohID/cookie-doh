// web/lib/assortments.ts
//
// Curated "ready in one tap" boxes — a fixed selection of cookies at the box
// price (3 -> BOX_PRICES[3], 6 -> BOX_PRICES[6]). Used by the storefront
// /assortments page and the cafe POS.

export type AssortmentItem = { flavorId: string; qty: number };

export type Assortment = {
  key: string;
  title: string;
  tagline: string;
  description: string;
  badge: string;
  boxSize: 3 | 6;
  items: AssortmentItem[];
};

export const ASSORTMENTS: Assortment[] = [
  {
    key: "box3-crowd",
    title: "Crowd Favourites",
    tagline: "The greatest hits",
    description:
      "Our three most-loved cookies in one little box: the bold dark-chocolate The One, the deeply rich The Other One, and the serene Matcha Magic. The perfect first taste of Cookie Doh.",
    badge: "Bestseller",
    boxSize: 3,
    items: [
      { flavorId: "the-one", qty: 1 },
      { flavorId: "the-other-one", qty: 1 },
      { flavorId: "matcha-magic", qty: 1 },
    ],
  },
  {
    key: "box6-bestmix",
    title: "The Best Mix",
    tagline: "A little of everything",
    description:
      "A curated half-dozen for every mood — double helpings of our two bestsellers, plus earthy Matcha Magic and a cozy, late-night Midnight Crave. Made for sharing (or keeping all to yourself).",
    badge: "Fan Favourite",
    boxSize: 6,
    items: [
      { flavorId: "the-one", qty: 2 },
      { flavorId: "the-other-one", qty: 2 },
      { flavorId: "matcha-magic", qty: 1 },
      { flavorId: "midnight-crave", qty: 1 },
    ],
  },
  {
    key: "box6-floral",
    title: "Soft & Floral",
    tagline: "Gift-ready & elegant",
    description:
      "A delicate, pretty box that makes a lovely gift — fragrant Rose Lullaby, calming Lavender Hush, a blush of Strawberry Kiss, and a bright Ruby Glow. Romance in cookie form.",
    badge: "Gift Pick",
    boxSize: 6,
    items: [
      { flavorId: "rose-lullaby", qty: 2 },
      { flavorId: "lavender-hush", qty: 2 },
      { flavorId: "strawberry-kiss", qty: 1 },
      { flavorId: "ruby-glow", qty: 1 },
    ],
  },
];
