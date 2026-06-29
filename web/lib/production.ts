// web/lib/production.ts
//
// Production plan: how many recipes to bake, from live stock + recent sales.
//   • 2 dough bases — dark & light. 1 recipe = 11 cookies of a base.
//   • Per flavour, the smallest batch is HALF a recipe (≈5.5 cookies), and
//     production rounds up to the next ½-recipe.
//   • For each flavour: forecast = (sales/day over the window) × horizon days;
//     need = max(0, forecast − current stock across all locations); then round
//     up to ½-recipe units. Base subtotal = sum of its flavours' recipes.
import { FLAVORS } from "@/lib/catalog";
import { classifyItem } from "@/lib/loyalty";

export const RECIPE_SIZE = 11; // cookies per full recipe
const HALF = RECIPE_SIZE / 2; // smallest batch per flavour (5.5)

// Which base each flavour's dough uses. (Crimson Crush isn't in the catalog yet;
// add it to FLAVORS + here when it exists.)
export const BASE_OF: Record<string, "dark" | "light"> = {
  "the-one": "dark",
  "the-other-one": "dark",
  "orange-in-the-dark": "dark",
  "midnight-crave": "dark",
  "one-shade-of-grey": "dark",
  "velvety-red": "dark",
  "matcha-magic": "light",
  "lavender-hush": "light",
  "rose-lullaby": "light",
  "strawberry-kiss": "light",
  "ruby-glow": "light",
};

const NAME_OF: Record<string, string> = Object.fromEntries(
  (FLAVORS as any[]).map((f) => [String(f.id), String(f.name)])
);

export type FlavourPlan = {
  id: string;
  name: string;
  base: "dark" | "light";
  sold: number; // units in the window
  perDay: number; // sales rate
  stock: number; // current, summed across locations
  forecast: number; // expected demand over the horizon
  need: number; // cookies short (forecast − stock, floored at 0)
  recipes: number; // rounded up to ½-recipe units
};

export type BasePlan = { base: "dark" | "light"; recipes: number; cookies: number; flavours: FlavourPlan[] };

export type ProductionPlan = {
  windowDays: number;
  horizonDays: number;
  recipeSize: number;
  paidOrders: number; // sample size in the window
  bases: BasePlan[];
  totalRecipes: number;
};

function parseItems(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") { try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

export async function computeProductionPlan(
  supa: any,
  opts?: { windowDays?: number; horizonDays?: number }
): Promise<ProductionPlan> {
  const windowDays = Math.max(1, Math.floor(opts?.windowDays ?? 28));
  const horizonDays = Math.max(1, Math.floor(opts?.horizonDays ?? 14));

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const [ordersRes, stockRes] = await Promise.all([
    supa.from("orders").select("items_json, payment_status, created_at").eq("payment_status", "PAID").gte("created_at", since).limit(8000),
    supa.from("location_stock").select("item_id, stock").limit(5000),
  ]);

  // Cookie units sold per flavour (count every cookie that left — paid + free —
  // since they all deplete stock; exclude ruby-glow/strawberry-kiss sold as drinks).
  const sold: Record<string, number> = {};
  for (const o of ordersRes.data || []) {
    for (const it of parseItems(o?.items_json)) {
      const id = String(it?.id ?? "");
      if (!BASE_OF[id]) continue;
      if (classifyItem(id, it?.kind) !== "cookie") continue;
      const q = Math.max(0, Math.floor(Number(it?.quantity ?? 0)));
      if (q) sold[id] = (sold[id] || 0) + q;
    }
  }

  const stock: Record<string, number> = {};
  for (const r of stockRes.data || []) {
    const id = String(r?.item_id ?? "");
    if (BASE_OF[id]) stock[id] = (stock[id] || 0) + Math.max(0, Math.floor(Number(r?.stock ?? 0)));
  }

  const rows: FlavourPlan[] = Object.keys(BASE_OF).map((id) => {
    const s = sold[id] || 0;
    const perDay = s / windowDays;
    const st = stock[id] || 0;
    const forecast = Math.ceil(perDay * horizonDays);
    const need = Math.max(0, forecast - st);
    const recipes = need > 0 ? Math.ceil(need / HALF) * 0.5 : 0; // round up to ½-recipe
    return { id, name: NAME_OF[id] || id, base: BASE_OF[id], sold: s, perDay, stock: st, forecast, need, recipes };
  });

  const bases: BasePlan[] = (["dark", "light"] as const).map((base) => {
    const flavours = rows
      .filter((r) => r.base === base)
      .sort((a, b) => b.need - a.need || b.perDay - a.perDay);
    const recipes = flavours.reduce((n, f) => n + f.recipes, 0);
    return { base, recipes, cookies: Math.round(recipes * RECIPE_SIZE), flavours };
  });

  return {
    windowDays,
    horizonDays,
    recipeSize: RECIPE_SIZE,
    paidOrders: (ordersRes.data || []).length,
    bases,
    totalRecipes: bases.reduce((n, b) => n + b.recipes, 0),
  };
}
