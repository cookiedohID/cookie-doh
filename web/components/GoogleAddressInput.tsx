// /Users/angeltan/cookie-doh/web/components/GoogleAddressInput.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Resolved address payload emitted by this component.
 * - formattedAddress: best “full” address string (formatted + name/premise when available)
 * - name: place name (often building / POI)
 * - building: best-effort building/premise/POI name
 * - postal/city: extracted from address_components when available
 * - lat/lng: geometry coords (fallback to Geocoder by placeId if needed)
 * - isResolved: true only when user selects a Google suggestion (place_changed)
 */
export type Resolved = {
  placeId?: string;
  formattedAddress: string;

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

  // Optional: you can still pass value from parent, but this component won't freeze
  value?: string;
  onChange?: (val: string) => void;

  // Fires ONLY when Google suggestions are chosen (place_changed)
  onResolved: (data: Resolved) => void;

  placeholder?: string;

  // Optional tuning:
  country?: string; // default: "id"
  types?: string[]; // default: ["geocode"] (use ["establishment"] for building search)
  className?: string; // override input class if you want
};

function loadGoogle(apiKey: string) {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") return resolve();

    const w = window as any;
    if (w.google?.maps?.places) return resolve();

    const existing = document.querySelector(`script[data-google-maps="1"]`) as HTMLScriptElement | null;
    if (existing) {
      // if already loaded
      if ((existing as any)._cdLoaded) return resolve();

      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Google script load error")));
      return;
    }

    const script = document.createElement("script");
    script.dataset.googleMaps = "1";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      (script as any)._cdLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Google script load error"));
    document.head.appendChild(script);
  });
}

function extractAddressParts(place: any) {
  let postal: string | null = null;
  let city: string | null = null;
  let building: string | null = null;

  const comps: any[] = Array.isArray(place?.address_components) ? place.address_components : [];

  for (const c of comps) {
    const types: string[] = Array.isArray(c?.types) ? c.types : [];
    const val = c?.long_name || c?.short_name || null;

    if (types.includes("postal_code")) postal = val || postal;

    // city: locality OR admin area level 2 (Jaksel etc.)
    if (types.includes("locality") || types.includes("administrative_area_level_2")) {
      city = val || city;
    }

    // building / premise / POI-ish
    if (types.includes("premise")) building = val || building;
    if (!building && types.includes("subpremise")) building = val || building;
    if (!building && types.includes("point_of_interest")) building = val || building;
    if (!building && types.includes("establishment")) building = val || building;
  }

  return { postal, city, building };
}

/**
 * Build a nicer "full address" string:
 * - If place has name and formatted_address, combine them:
 *     "Kemang Village – Infinity Tower, ...formatted..."
 * - Otherwise fall back to formatted_address or name or current input value
 */
function buildFullAddress(place: any, elValue: string) {
  const name: string | null = place?.name || null;
  const formatted: string | null = place?.formatted_address || null;

  if (name && formatted) {
    // avoid duplication if formatted already starts with name
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
  placeholder = "Type your address…",
  country = "id",
  types = ["geocode"],
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const acRef = useRef<any>(null);

  // local state prevents freezing after selection
  const [internalValue, setInternalValue] = useState(value ?? "");

  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // for UX: show whether user has chosen a suggestion since last edit
  const [isResolved, setIsResolved] = useState(false);

  const canInit = useMemo(() => Boolean(apiKey && apiKey.length > 10), [apiKey]);

  // Sync external value -> internal (only when it truly changes)
  useEffect(() => {
    if (typeof value === "string" && value !== internalValue) {
      setInternalValue(value);
    }
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

        // If re-initializing, clear old listeners by recreating autocomplete
        const ac = new g.maps.places.Autocomplete(el, {
          fields: ["place_id", "formatted_address", "geometry", "address_components", "name"],
          types,
          componentRestrictions: country ? { country } : undefined,
        });

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
            } catch {
              // ignore
            }
          }

          // fallback geocode if geometry missing
          const w2 = window as any;
          const g2 = w2.google;

          if ((lat === null || lng === null) && placeId && g2?.maps?.Geocoder) {
            try {
              const geocoder = new g2.maps.Geocoder();
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
            } catch {
              // ignore
            }
          }

          const { postal, city, building } = extractAddressParts(place);

          // update local value so input stays editable after selection
          setInternalValue(fullAddress);
          onChange?.(fullAddress);

          setIsResolved(true);

          onResolved({
            placeId,
            formattedAddress: fullAddress,
            name: place?.name || null,
            building: building || place?.name || null,
            lat,
            lng,
            postal,
            city,
            isResolved: true,
          });
        });

        acRef.current = ac;
        setReady(true);
        setErr(null);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to init Google Places");
      }
    }

    init();
    return () => {
      mounted = false;
      acRef.current = null;
    };
  }, [apiKey, canInit, onResolved, onChange, country, types]);

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        value={internalValue}
        onChange={(e) => {
          const v = e.target.value;
          setInternalValue(v);
          setIsResolved(false); // manual edit means not validated anymore
          onChange?.(v);
        }}
        placeholder={placeholder}
        className={
          className ||
          "w-full rounded-2xl border bg-white px-4 py-3 text-sm outline-none focus:ring-2"
        }
        autoComplete="off"
        name="cd_address"
        inputMode="text"
      />

      <div className="text-xs text-neutral-500">
        {err ? (
          <span className="text-red-600">{err}</span>
        ) : ready ? (
          <span>
            {isResolved
              ? "Address selected ✓ You can still edit it if needed."
              : "Pick an address from suggestions for best delivery accuracy."}
          </span>
        ) : canInit ? (
          <span>Loading address autocomplete…</span>
        ) : (
          <span>Address autocomplete unavailable (missing Google API key).</span>
        )}
      </div>
    </div>
  );
}
