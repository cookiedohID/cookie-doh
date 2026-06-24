// web/lib/subscriptions.ts — pure helpers for prepaid cookie-box subscriptions.
// No DB, no network — just pricing + date math + validation, so it's safe to use
// on both the server (checkout/cron) and (the price/label parts) the client wizard.
import { BOX_PRICES } from "@/lib/catalog";

export type SubFrequency = "weekly" | "biweekly" | "monthly";
export type SubMode = "fixed" | "curated";
export type SubFulfilment = "delivery" | "pickup";

// Plan lengths the customer can prepay (number of boxes). 4 / 8 / 12.
export const SUB_PLAN_BOX_OPTIONS = [4, 8, 12] as const;
export const SUB_BOX_SIZES = [3, 6] as const;
export const SUB_FREQUENCIES: SubFrequency[] = ["weekly", "biweekly", "monthly"];

export const FREQUENCY_LABEL: Record<SubFrequency, string> = {
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  monthly: "Every month",
};

// Days between deliveries (monthly is handled by calendar month, not this).
export const FREQUENCY_DAYS: Record<Exclude<SubFrequency, "monthly">, number> = {
  weekly: 7,
  biweekly: 14,
};

// How many days after activation the first box ships (prep + scheduling lead time).
export const FIRST_BOX_LEAD_DAYS = 3;

export function subBoxPrice(boxSize: number): number {
  return (BOX_PRICES as Record<number, number>)[boxSize] ?? 0;
}

// What one prepaid plan costs: N boxes × the normal box price. Server-authoritative;
// the client never sends a price. (No subscription discount — the perk is the
// "buy 6, get 1 free" bonus cookies, applied at fulfilment.)
export function subPlanAmount(boxSize: number, boxes: number): number {
  return subBoxPrice(boxSize) * boxes;
}

// Subscription reward = "buy 6, get 1 free": one free cookie for every 6 cookies
// received. Total free cookies over a plan of N boxes of `boxSize`.
// Box of 6 → 1 per box; box of 3 → 1 per 2 boxes.
export function subFreeCookies(boxSize: number, boxes: number): number {
  return Math.floor((boxes * boxSize) / 6);
}

export function isValidBoxSize(n: unknown): n is 3 | 6 {
  return n === 3 || n === 6;
}
export function isValidPlanBoxes(n: unknown): boolean {
  return (SUB_PLAN_BOX_OPTIONS as readonly number[]).includes(Number(n));
}
export function isValidFrequency(s: unknown): s is SubFrequency {
  return s === "weekly" || s === "biweekly" || s === "monthly";
}
export function isValidMode(s: unknown): s is SubMode {
  return s === "fixed" || s === "curated";
}

// ── Date math (UTC, date-only "YYYY-MM-DD") ──────────────────────────────────
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// The box AFTER `iso`, given the cadence. Monthly clamps to anchorDom (e.g. the
// 31st becomes the 30th/28th in shorter months) so it never rolls into next month.
export function nextDeliveryDate(iso: string, frequency: SubFrequency, anchorDom?: number | null): string {
  if (frequency === "monthly") {
    const d = new Date(iso + "T00:00:00Z");
    const dom = anchorDom && anchorDom >= 1 && anchorDom <= 31 ? anchorDom : d.getUTCDate();
    d.setUTCMonth(d.getUTCMonth() + 1, 1); // go to the 1st of next month first
    const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(dom, daysInMonth));
    return d.toISOString().slice(0, 10);
  }
  return addDays(iso, FREQUENCY_DAYS[frequency]);
}

// Fixed-mode flavour list: [{id,name,quantity}] that must sum to exactly box_size.
export type FixedFlavour = { id: string; name: string; quantity: number };
export function normalizeFixedFlavours(input: unknown): FixedFlavour[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((f: any) => ({
      id: String(f?.id ?? "").trim(),
      name: String(f?.name ?? "").trim() || "Cookie",
      quantity: Math.max(0, Math.floor(Number(f?.quantity ?? 0))),
    }))
    .filter((f) => f.id && f.quantity > 0);
}
export function fixedFlavoursValid(flavours: FixedFlavour[], boxSize: number): boolean {
  const total = flavours.reduce((s, f) => s + f.quantity, 0);
  return total === boxSize;
}

// Midtrans order id for a prepaid plan. The CD-SUB- prefix is how the payment
// webhook routes this to the subscription branch (never an order row).
export function makeSubOrderId(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(16).slice(2, 8).toUpperCase();
  return `CD-SUB-${y}${m}${day}-${rand}`;
}

export function modeLabel(mode: SubMode): string {
  return mode === "fixed" ? "Your fixed favourites" : "Curated surprise";
}
