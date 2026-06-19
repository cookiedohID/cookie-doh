// web/lib/locations.ts
//
// The 4 Cookie Doh stock locations (Kemang kitchen + 3 Total Buah Segar points).
// Stable config — edit here (and keep COOKIE_DOH_PICKUP_POINTS_JSON in sync) if a
// location is added/moved. `location_stock` rows are keyed by these `id`s.

export type StoreLocation = {
  id: string;
  name: string;
  short: string;
  address: string;
  lat: number;
  lng: number;
};

export const LOCATIONS: StoreLocation[] = [
  {
    id: "kemang",
    name: "Cookie Doh — Kemang",
    short: "Kemang",
    address: "Kemang Village Residence Infinity Tower unit ipn2, Jakarta Selatan",
    lat: -6.2589497,
    lng: 106.8123208,
  },
  {
    id: "tbs-rcv",
    name: "Total Buah Segar — RC Veteran (Bintaro)",
    short: "RC Veteran",
    address:
      "Jl. RC. Veteran Raya No.208, Bintaro, Pesanggrahan, Jakarta Selatan 12330",
    lat: -6.26234,
    lng: 106.76635,
  },
  {
    id: "tbs-ktr",
    name: "Total Buah Segar — Karang Tengah (Lebak Bulus)",
    short: "Karang Tengah",
    address:
      "Jl. Karang Tengah Raya, Lebak Bulus, Cilandak, Jakarta Selatan 12440",
    lat: -6.30766,
    lng: 106.78101,
  },
  {
    id: "tbs-xmas",
    name: "Total Buah Segar — KH Noer Ali (Bekasi)",
    short: "Bekasi",
    address:
      "Jl. KH. Noer Ali No.9, Kayuringin Jaya, Bekasi Selatan, Jawa Barat 17144",
    lat: -6.24735,
    lng: 106.97999,
  },
];

export const DEFAULT_LOCATION_ID = "kemang";

export function getLocation(id?: string | null): StoreLocation | undefined {
  if (!id) return undefined;
  return LOCATIONS.find((l) => l.id === id);
}

// Haversine distance in km.
function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const a =
    s1 * s1 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      s2 *
      s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Which store fulfils an order — the single source of truth shared by stock
 * decrement (lib/stock.ts) and the reports, so sales and inventory always
 * attribute to the SAME location. Prefer the quoted origin, else nearest store
 * to the delivery coords, else the pickup location, else the default store.
 */
export function locationForOrder(order: any): string {
  let locationId: string | undefined = order?.meta?.quote?.origin?.id;
  if (!locationId) {
    const shipping = order?.shipping_json || {};
    const lat = Number(shipping.destination_lat ?? shipping.lat);
    const lng = Number(shipping.destination_lng ?? shipping.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) locationId = nearestLocation(lat, lng).id;
  }
  if (!locationId) locationId = order?.meta?.pickup?.locationId || DEFAULT_LOCATION_ID;
  return locationId || DEFAULT_LOCATION_ID;
}

/** Pick the nearest active location to a customer coordinate. Falls back to default. */
export function nearestLocation(
  lat?: number | null,
  lng?: number | null
): StoreLocation {
  const fallback = getLocation(DEFAULT_LOCATION_ID) ?? LOCATIONS[0];
  if (typeof lat !== "number" || typeof lng !== "number") return fallback;

  let best = fallback;
  let bestD = Infinity;
  for (const loc of LOCATIONS) {
    const d = distanceKm(lat, lng, loc.lat, loc.lng);
    if (d < bestD) {
      bestD = d;
      best = loc;
    }
  }
  return best;
}
