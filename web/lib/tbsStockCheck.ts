// web/lib/tbsStockCheck.ts — ONE stock checker for every TBS basket UI and
// both checkout routes. Per-line checks (gone/out/short) plus the cross-pack
// aggregate the per-line pass can't see: 27 singles + 1 "Box of 20" of the
// same product is 47 pcs of demand against one 25-pc base stock (owner-found
// oversell, 2026-07-04). The ERP /stock response carries everything needed:
// the base entry's `stock` IS the base stock, and a variant's factor is in the
// ERP-generated "(Box of N)" name suffix — ask for base SKUs alongside
// variants (expandTbsSkus) and add demand up per product.
export type TbsLineWant = { sku: string; qty: number };
export type TbsStockIssue = { type: "out" | "short" | "gone" | "group"; stock: number };

// Variant → base-unit factor. 1 for base lines. Prefers the ERP's explicit
// `factor` field (contract since partner a152e09); until that deploys, falls
// back to the ERP-generated "(Box of N)" name suffix; 0 = unknown (skip the
// aggregate for that line).
export function boxFactor(entry: { name?: unknown; factor?: unknown }, sku: string): number {
  if (!sku.includes("@")) return 1;
  const f = Math.round(Number(entry?.factor));
  if (Number.isFinite(f) && f >= 1) return f;
  const m = /\(Box of (\d+)\)\s*$/.exec(String(entry?.name || ""));
  return m ? Math.max(1, parseInt(m[1], 10)) : 0;
}

// Every variant request also fetches its base SKU (the base entry's stock is
// the shared pool all pack sizes draw from). Deduped, order preserved.
export function expandTbsSkus(skus: string[]): string[] {
  const out = new Set<string>();
  for (const s of skus) {
    const t = String(s || "").trim();
    if (!t) continue;
    out.add(t);
    const base = t.split("@")[0];
    if (base) out.add(base);
  }
  return [...out];
}

export function computeTbsStockIssues(lines: TbsLineWant[], items: any[]): Record<string, TbsStockIssue> {
  const bySku = new Map(items.map((x: any) => [String(x.sku), x]));
  const stockLive = items.some((x: any) => x.stockLive);
  const issues: Record<string, TbsStockIssue> = {};

  for (const l of lines) {
    const x: any = bySku.get(l.sku);
    if (!x || !(Number(x.price) > 0)) { issues[l.sku] = { type: "gone", stock: 0 }; continue; }
    if (stockLive) {
      const st = Math.max(0, Number(x.stock) || 0);
      if (st <= 0) issues[l.sku] = { type: "out", stock: 0 };
      else if (st < l.qty) issues[l.sku] = { type: "short", stock: st };
    }
  }

  if (stockLive) {
    const groups: Record<string, { demand: number; baseStock: number; lines: string[] }> = {};
    for (const l of lines) {
      if (issues[l.sku]?.type === "gone") continue;
      const x: any = bySku.get(l.sku);
      if (!x) continue;
      const base = l.sku.split("@")[0];
      const baseEntry: any = bySku.get(base);
      // explicit baseStock (new ERP contract) beats deriving from the base entry
      const bs = Number.isFinite(Number(x.baseStock)) ? Math.max(0, Number(x.baseStock))
        : baseEntry ? Math.max(0, Number(baseEntry.stock) || 0) : null;
      if (bs === null) continue;
      const f = boxFactor(x, l.sku);
      if (!f) continue;
      groups[base] ||= { demand: 0, baseStock: bs, lines: [] };
      groups[base].demand += Math.max(0, Math.round(Number(l.qty) || 0)) * f;
      groups[base].lines.push(l.sku);
    }
    for (const g of Object.values(groups)) {
      if (g.demand > g.baseStock) {
        for (const sku of g.lines) if (!issues[sku]) issues[sku] = { type: "group", stock: g.baseStock };
      }
    }
  }
  return issues;
}

export function tbsIssueText(i: TbsStockIssue, lang: "id" | "en" = "id"): string {
  if (lang === "en") {
    if (i.type === "short") return `Only ${i.stock} left — reduce the quantity`;
    if (i.type === "group") return `Only ${i.stock} in stock across all pack sizes — reduce`;
    return "Out of stock — please remove";
  }
  if (i.type === "short") return `Sisa ${i.stock} — kurangi jumlahnya`;
  if (i.type === "group") return `Total stok ${i.stock} untuk semua ukuran kemasan — kurangi`;
  return "Stok habis — mohon hapus";
}

// A line is dead (dim it, only removal makes sense) vs fixable by reducing.
export function tbsIssueDead(i: TbsStockIssue | undefined): boolean {
  return Boolean(i && (i.type === "out" || i.type === "gone"));
}
