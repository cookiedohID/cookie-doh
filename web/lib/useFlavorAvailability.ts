// web/lib/useFlavorAvailability.ts
"use client";

import { useEffect, useState } from "react";

export type AvailabilityRow = { soldOut: boolean; stock: number | null };
export type ByLocation = Record<string, Record<string, AvailabilityRow>>;

export function useFlavorAvailability() {
  // map        = aggregated effective sold-out (boolean) per item — storefront
  // byLocation = raw { soldOut, stock } per location per item — admin
  const [map, setMap] = useState<Record<string, boolean>>({});
  const [byLocation, setByLocation] = useState<ByLocation>({});
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/flavors/availability", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      setMap(j?.map && typeof j.map === "object" ? j.map : {});
      setByLocation(j?.byLocation && typeof j.byLocation === "object" ? j.byLocation : {});
    } catch {
      setMap({});
      setByLocation({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return { map, byLocation, loading, refresh };
}
