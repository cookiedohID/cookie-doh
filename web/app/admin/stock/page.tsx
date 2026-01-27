// web/app/admin/stock/page.tsx
import { createClient } from "@supabase/supabase-js";
import StockAdminClient from "./StockAdminClient";

export const runtime = "nodejs";

type Store = { id: string; name: string };

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL)");
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function AdminStockPage() {
  const supa = supaAdmin();

  const storesRes = await supa.from("store_locations").select("id,name").order("name", { ascending: true });
  const stockRes = await supa.from("flavor_stock").select("store_id, flavor_id, qty");

  const stores: Store[] = Array.isArray(storesRes.data) ? (storesRes.data as any) : [];

  const stock: Record<string, Record<string, number>> = {};
  for (const row of stockRes.data || []) {
    const sid = String((row as any).store_id);
    const fid = String((row as any).flavor_id);
    const qty = Number((row as any).qty ?? 0);
    stock[sid] = stock[sid] || {};
    stock[sid][fid] = Number.isFinite(qty) ? qty : 0;
  }

  // Pass initial data to client component (no "Loading..." needed)
  return <StockAdminClient initialStores={stores} initialStock={stock} />;
}
