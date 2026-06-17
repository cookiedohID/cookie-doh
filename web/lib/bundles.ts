// web/lib/bundles.ts
//
// Bundles = a fixed-price set where the customer picks any X cookies + any Y
// drinks. Edit this list to add/remove bundles or change composition/price.
// (A DB-backed admin CRUD can replace this later — same shape.)

export type Bundle = {
  id: string;
  name: string;
  description?: string;
  cookies: number; // how many cookies the customer chooses
  drinks: number; // how many drinks the customer chooses
  price: number; // fixed bundle price (Rupiah)
  badge?: string;
  image?: string;
};

export const BUNDLES: Bundle[] = [
  {
    id: "daily-duo",
    name: "Daily Duo",
    description: "Any 1 cookie + any 1 drink — the perfect solo treat.",
    cookies: 1,
    drinks: 1,
    price: 65000, // vs ~71.5k separately
    badge: "Best Value",
  },
  {
    id: "sweet-sharer",
    name: "Sweet Sharer",
    description: "Any 3 cookies + any 2 drinks — made for sharing.",
    cookies: 3,
    drinks: 2,
    price: 159000, // vs ~175.5k separately
  },
  {
    id: "party-pack",
    name: "Party Pack",
    description: "Any 6 cookies + any 4 drinks — the crowd-pleaser.",
    cookies: 6,
    drinks: 4,
    price: 299000, // vs ~351k separately
    badge: "Crowd Favourite",
  },
];

export function getBundle(id?: string | null): Bundle | undefined {
  return id ? BUNDLES.find((b) => b.id === id) : undefined;
}
