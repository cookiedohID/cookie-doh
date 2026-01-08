"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Resolved = {
  placeId?: string;
  formattedAddress: string;
  lat: number | null;
  lng: number | null;
  postal: string | null;
  city: string | null;
};

type Props = {
  apiKey: string;
  value: string;
  onChange: (val: string) => void;
  onResolved: (data: Resolved) => void;
  placeholder?: string;
};

function loadGoogle(apiKey: string) {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") return resolve();

    const w = window as any;
    if (w.google?.maps?.places) return resolve();

    const existing = document.querySelector(`script[data-google-maps="1"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Google script load error")));
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

  const comps: any[] = Array.isArray(place?.address_components) ? place.address_components : [];
  for (const c of comps) {
    const types: string[] = Array.isArray(c?.types) ? c.types : [];
    if (types.includes("postal_code")) postal = c.long_name || c.short_name || postal;

    // City in Indonesia can come as locality or admin_area_level_2
    if (types.includes("locality") || types.includes("administrative_area_level_2")) {
      city = c.long_name || c.short_name || city;
    }
  }

  return { postal, city };
}

export default function GoogleAddressInput({
  apiKey,
  value,
  onChange,
  onResolved,
  placeholder = "Type your address…",
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const acRef = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canInit = useMemo(() => Boolean(apiKey && apiKey.length > 10), [apiKey]);

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
        if (!g?.maps?.places?.Autocomplete) {
          throw new Error("Google Places not available");
        }

        const ac = new g.maps.places.Autocomplete(el, {
          fields: ["place_id", "formatted_address", "geometry", "address_components", "name"],
          types: ["geocode"],
          // componentRestrictions: { country: "id" },
        });

        ac.addListener("place_changed", async () => {
          const place = ac.getPlace?.() ?? null;

          const formattedAddress =
            place?.formatted_address || place?.name || el.value || "";

          const placeId = place?.place_id;

          let lat: number | null = null;
          let lng: number | null = null;

          // Primary: geometry on place
          if (place?.geometry?.location) {
            try {
              lat = place.geometry.location.lat?.() ?? null;
              lng = place.geometry.location.lng?.() ?? null;
            } catch {
              // ignore
            }
          }

          // Fallback: geocode by placeId if geometry missing
          if ((!lat || !lng) && placeId && g?.maps?.Geocoder) {
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
            } catch {
              // ignore
            }
          }

          const { postal, city } = extractAddressParts(place);

          onChange(formattedAddress);

          onResolved({
            placeId,
            formattedAddress,
            lat,
            lng,
            postal,
            city,
          });
        });

        acRef.current = ac;
        setReady(true);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to init Google Places");
      }
    }

    init();

    return () => {
      mounted = false;
      acRef.current = null;
    };
  }, [apiKey, canInit, onChange, onResolved]);

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border bg-white px-4 py-3 text-sm outline-none focus:ring-2"
      />

      <div className="text-xs text-neutral-500">
        {err ? (
          <span className="text-red-600">{err}</span>
        ) : ready ? (
          <span>Pick the exact address from suggestions (recommended).</span>
        ) : (
          <span>Loading address autocomplete…</span>
        )}
      </div>
    </div>
  );
}
