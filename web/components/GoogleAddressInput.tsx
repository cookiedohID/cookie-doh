// web/components/GoogleAddressInput.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type Resolved = {
  placeId?: string;

  formattedAddress: string;
  formatted_address?: string; // alias for compatibility

  name: string | null;
  building: string | null;

  lat: number | null;
  lng: number | null;

  postal: string | null;
  city: string | null;

  isResolved: boolean;
};

type Props = {
  apiKey: string;

  value?: string;
  onChange?: (val: string) => void;

  onResolved: (data: Resolved) => void;

  placeholder?: string;

  country?: string; // default "id"
  /**
   * IMPORTANT:
   * - If you pass types=["geocode"], building/POI suggestions often disappear.
   * - To allow BOTH address + building search in ONE field, leave types undefined.
   */
  types?: string[]; // optional
  className?: string;
};

function loadGoogle(apiKey: string) {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") return resolve();

    const w = window as any;
    if (w.google?.maps?.places) return resolve();

    const existing = document.querySelector(
      `script[data-google-maps="1"]`
    ) as HTMLScriptElement | null;

    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Google script load error"))
      );
      return;
    }

    const script = document.createElement("script");
    script.dataset.googleMaps = "1";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google script load error"));
    document.head.appendChild(script);
  });
}

function extractAddressParts(place: any) {
  let postal: string | null = null;
  let city: string | null = null;
  let building: string | null = null;

  const comps: any[] = Array.isArray(place?.address_components)
    ? place.address_components
    : [];

  for (const c of comps) {
    const types: string[] = Array.isArray(c?.types) ? c.types : [];
    const val: string | null = c?.long_name || c?.short_name || null;

    if (types.includes("postal_code")) postal = val || postal;

    if (types.includes("locality") || types.includes("administrative_area_level_2")) {
      city = val || city;
    }

    if (!building && types.includes("premise")) building = val || building;
    if (!building && types.includes("subpremise")) building = val || building;
    if (!building && types.includes("point_of_interest")) building = val || building;
    if (!building && types.includes("establishment")) building = val || building;
  }

  return { postal, city, building };
}

function firstSegment(addr: string) {
  const s = (addr || "").trim();
  if (!s) return "";
  return s.split(",")[0].trim();
}

function buildFullAddress(place: any, elValue: string) {
  const name: string | null = place?.name || null;
  const formatted: string | null = place?.formatted_address || null;

  // If building/POI selected, include its name for user clarity
  if (name && formatted) {
    const lower = formatted.toLowerCase();
    if (lower.startsWith(name.toLowerCase())) return formatted;
    return `${name}, ${formatted}`;
  }

  return formatted || name || elValue || "";
}

export default function GoogleAddressInput({
  apiKey,
  value,
  onChange,
  onResolved,
  placeholder = "Type building name or address…",
  country = "id",
  types, // IMPORTANT: default undefined
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const gRef = useRef<any>(null); // google namespace, for blur-geocode fallback
  const resolvedRef = useRef(false); // synchronous mirror of isResolved (avoids races)

  const [internalValue, setInternalValue] = useState(value ?? "");
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isResolved, setIsResolved] = useState(false);

  const markResolved = (v: boolean) => {
    resolvedRef.current = v;
    setIsResolved(v);
  };

  // Fallback: resolve free-text (browser-autofilled or typed-without-picking) to
  // coordinates using the Places API (Autocomplete predictions + Place details),
  // so customers never have to re-type. Uses Places (already enabled) — not the
  // Geocoding API.
  async function geocodeText(text: string) {
    const g = gRef.current;
    const t = (text || "").trim();
    if (!g?.maps?.places || !t) return;
    try {
      const OK = g.maps.places.PlacesServiceStatus.OK;

      // 1) Top prediction for the text, biased toward Greater Jakarta so a
      //    same-named street in another province isn't picked by mistake.
      const svc = new g.maps.places.AutocompleteService();
      const preds: any[] = await new Promise((resolve, reject) => {
        svc.getPlacePredictions(
          {
            input: t,
            componentRestrictions: country ? { country } : undefined,
            location: new g.maps.LatLng(-6.25, 106.83),
            radius: 60000,
          },
          (p: any, status: any) => {
            if (status === OK && p && p.length) resolve(p);
            else reject(new Error(String(status)));
          }
        );
      });
      const placeId = preds[0]?.place_id;
      if (!placeId) return;

      // 2) Details for coords + components.
      const placesSvc = new g.maps.places.PlacesService(document.createElement("div"));
      const place: any = await new Promise((resolve, reject) => {
        placesSvc.getDetails(
          {
            placeId,
            fields: ["place_id", "formatted_address", "geometry", "address_components", "name"],
          },
          (pl: any, status: any) => {
            if (status === OK && pl) resolve(pl);
            else reject(new Error(String(status)));
          }
        );
      });

      const lat = place?.geometry?.location?.lat?.() ?? null;
      const lng = place?.geometry?.location?.lng?.() ?? null;

      // Service-area sanity check: same-day delivery covers Greater Jakarta + Bekasi.
      // If the auto-matched place is implausibly far (e.g. a same-named street in
      // another province), don't accept it — let the customer pick from the dropdown.
      if (typeof lat === "number" && typeof lng === "number") {
        const dLat = (lat - -6.25) * 111;
        const dLng = (lng - 106.83) * 111 * Math.cos((-6.25 * Math.PI) / 180);
        const km = Math.sqrt(dLat * dLat + dLng * dLng);
        if (km > 80) return; // out of service area — stay unresolved
      }

      const { postal, city, building } = extractAddressParts(place);

      // Keep the customer's own text (preserves unit/building details), attach coords.
      markResolved(true);
      onResolved({
        placeId,
        formattedAddress: t,
        formatted_address: t,
        name: place?.name || null,
        building: (building && building.trim()) || firstSegment(t) || null,
        lat,
        lng,
        postal,
        city,
        isResolved: true,
      });
    } catch {
      // leave unresolved; the dropdown is still available
    }
  }

  const canInit = useMemo(() => Boolean(apiKey && apiKey.length > 10), [apiKey]);

  useEffect(() => {
    if (typeof value === "string" && value !== internalValue) setInternalValue(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        if (!canInit) return;

        await loadGoogle(apiKey);
        if (!mounted) return;

        const el = inputRef.current;
        if (!el) return;

        const w = window as any;
        const g = w.google;
        if (!g?.maps?.places?.Autocomplete) throw new Error("Google Places not available");
        gRef.current = g;

        const options: any = {
          fields: ["place_id", "formatted_address", "geometry", "address_components", "name"],
          componentRestrictions: country ? { country } : undefined,
        };

        // ✅ Only apply types if explicitly provided
        // Leaving it undefined allows BOTH building/POI + address results
        if (Array.isArray(types) && types.length > 0) {
          options.types = types;
        }

        const ac = new g.maps.places.Autocomplete(el, options);

        ac.addListener("place_changed", async () => {
          const place = ac.getPlace?.() ?? null;

          const placeId: string | undefined = place?.place_id;
          const fullAddress = buildFullAddress(place, el.value);

          let lat: number | null = null;
          let lng: number | null = null;

          if (place?.geometry?.location) {
            try {
              lat = place.geometry.location.lat?.() ?? null;
              lng = place.geometry.location.lng?.() ?? null;
            } catch {}
          }

          // fallback geocode if geometry missing
          if ((lat === null || lng === null) && placeId && g?.maps?.Geocoder) {
            try {
              const geocoder = new g.maps.Geocoder();
              const results: any[] = await new Promise((resolve, reject) => {
                geocoder.geocode({ placeId }, (r: any, status: any) => {
                  if (status === "OK" && r && r.length) resolve(r);
                  else reject(new Error(`Geocoder failed: ${String(status)}`));
                });
              });

              const r0 = results[0];
              if (r0?.geometry?.location) {
                lat = r0.geometry.location.lat?.() ?? null;
                lng = r0.geometry.location.lng?.() ?? null;
              }
            } catch {}
          }

          const { postal, city, building: buildingFromComps } = extractAddressParts(place);

          // ✅ building is never empty if fullAddress exists
          const inferredBuilding =
            (buildingFromComps && buildingFromComps.trim()) ||
            (place?.name ? String(place.name).trim() : "") ||
            firstSegment(fullAddress) ||
            null;

          setInternalValue(fullAddress);
          onChange?.(fullAddress);

          markResolved(true);

          onResolved({
            placeId,
            formattedAddress: fullAddress,
            formatted_address: fullAddress,
            name: place?.name || null,
            building: inferredBuilding,
            lat,
            lng,
            postal,
            city,
            isResolved: true,
          });
        });

        setReady(true);
        setErr(null);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to init Google Places");
      }
    }

    init();
    return () => {
      mounted = false;
    };
  }, [apiKey, canInit, onResolved, onChange, country, types]);

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        value={internalValue}
        onChange={(e) => {
          const v = e.target.value;
          const wasResolved = resolvedRef.current;
          setInternalValue(v);
          markResolved(false);
          onChange?.(v);
          // If a location was previously resolved, drop its coords immediately so
          // an edited/invalid address never keeps the old lat/lng/postal.
          if (wasResolved) {
            onResolved({
              formattedAddress: v,
              formatted_address: v,
              name: null,
              building: null,
              lat: null,
              lng: null,
              postal: null,
              city: null,
              isResolved: false,
            });
          }
        }}
        onBlur={() => {
          // If the field has text but nothing was picked from the dropdown
          // (e.g. browser autofill), geocode it. Delay slightly so a dropdown
          // selection (place_changed) wins the race when the user clicks one.
          const text = (inputRef.current?.value || internalValue || "").trim();
          if (!text || resolvedRef.current) return;
          setTimeout(() => {
            if (!resolvedRef.current) geocodeText(text);
          }, 300);
        }}
        placeholder={placeholder}
        className={className || "w-full rounded-2xl border bg-white px-4 py-3 text-sm outline-none focus:ring-2"}
        autoComplete="shipping street-address"
        name="cd_address"
        inputMode="text"
      />

      <div className="text-xs text-neutral-500">
        {err ? (
          <span className="text-red-600">{err}</span>
        ) : ready ? (
          <span>{isResolved ? "Location found ✓" : "Pick a suggestion or use autofill — we'll locate it automatically."}</span>
        ) : canInit ? (
          <span>Loading address autocomplete…</span>
        ) : (
          <span>Address autocomplete unavailable (missing Google API key).</span>
        )}
      </div>
    </div>
  );
}
