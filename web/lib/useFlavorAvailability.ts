// web/lib/useFlavorAvailability.ts
"use client";

import { useEffect, useState } from "react";

export function useFlavorAvailability() {
  const [map, setMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/flavors/availability", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      setMap(j?.map && typeof j.map === "object" ? j.map : {});
    } catch {
      setMap({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // no polling by default (keep it light)
  }, []);

  return { map, loading, refresh };
}
