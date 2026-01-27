// web/lib/storeStock.ts
"use client";

import { useEffect, useMemo, useState } from "react";

export type StorePoint = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

const STORE_KEY = "cookie_doh_store_id_v1";

export function parsePickupPoints(raw: string | undefined): StorePoint[] {
  try {
    const arr = JSON.parse(raw || "[]");
    if (!Array.isArray(arr)) return [];
    return arr
      .map((p: any) => ({
        id: String(p.id || ""),
        name: String(p.name || ""),
        address: String(p.address || ""),
        lat: Number(p.lat),
        lng: Number(p.lng),
      }))
      .filter((p: StorePoint) => p.id && p.name && p.address && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  } catch {
    return [];
  }
}

export function getSavedStoreId(defaultId: string) {
  try {
    const v = localStorage.getItem(STORE_KEY);
    return v ? String(v) : defaultId;
  } catch {
    return defaultId;
  }
}

export function saveStoreId(id: string) {
  try {
    localStorage.setItem(STORE_KEY, String(id));
  } catch {}
}

export function useStoreStock(points: StorePoint[]) {
  const defaultId = points[0]?.id || "kemang";

  const [storeId, setStoreId] = useState<string>(() => {
    if (typeof window === "undefined") return defaultId;
    return getSavedStoreId(defaultId);
  });

  const [stock, setStock] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<boolean>(true);

  // keep storeId valid if points change
  useEffect(() => {
    if (!points.length) return;
    const ok = points.some((p) => p.id === storeId);
    if (!ok) {
      const next = points[0].id;
      setStoreId(next);
      saveStoreId(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length]);

  const storeName = useMemo(() => {
    const p = points.find((x) => x.id === storeId);
    return p?.name || storeId;
  }, [points, storeId]);

  const refresh = async (id?: string) => {
    const sid = String(id || storeId || defaultId);
    setLoading(true);
    try {
      const res = await fetch(`/api/stock/availability?store_id=${encodeURIComponent(sid)}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      const map = j?.stock && typeof j.stock === "object" ? j.stock : {};
      setStock(map);
    } catch {
      setStock({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!storeId) return;
    refresh(storeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const setStore = (id: string) => {
    const sid = String(id);
    setStoreId(sid);
    saveStoreId(sid);
  };

  return { storeId, setStore, storeName, stock, loading, refresh };
}
