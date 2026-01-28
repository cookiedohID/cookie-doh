// web/app/build/[size]/page.tsx
import { createClient } from "@supabase/supabase-js";
import BuildClient from "../BuildClient";

export const runtime = "nodejs";

type BoxSize = 3 | 6;

function parseSize(raw: unknown): BoxSize | null {
  const s = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  const n = Number(s);
  if (n === 3 || n === 6) return n;
  return null;
}

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchStoreStock(storeId: string): Promise<Record<string, number>> {
  const supa = supaAdmin();
  const { data, error } = await supa
    .from("flavor_stock")
    .select("flavor_id, qty")
    .eq("store_id", storeId);

  if (error) return {};

  const stock: Record<string, number> = {};
  for (const row of data || []) {
    const fid = String((row as any).flavor_id);
    const q = Number((row as any).qty ?? 0);
    stock[fid] = Number.isFinite(q) ? q : 0;
  }
  return stock;
}

export default async function BuildSizePage({ params }: { params: { size: string } }) {
  const initialBoxSize = parseSize(params.size) ?? 6;

  // ✅ Go-live: fixed store base Kemang
  const initialStock = await fetchStoreStock("kemang");

  return <BuildClient initialBoxSize={initialBoxSize} initialStock={initialStock} />;
}
