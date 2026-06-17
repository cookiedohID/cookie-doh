// web/lib/phone.ts
//
// Canonical Indonesian phone normalization so 08xxx, +628xxx, 628xxx and 8xxx
// all resolve to the same customer (canonical form: "+62XXXXXXXXXX").

export function canonicalPhone(input?: string | null): string | null {
  if (!input) return null;
  let n = String(input).replace(/[^\d+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  if (n.startsWith("0")) n = "62" + n.slice(1); // 08xx -> 628xx
  else if (n.startsWith("8")) n = "62" + n; // 8xx  -> 628xx
  if (!n.startsWith("62")) return null; // not an Indonesian number
  if (n.length < 11) return null; // too short to be valid
  return "+" + n;
}

/** The significant local digits (after the 62 country code) — for loose matching. */
export function phoneSignificant(input?: string | null): string | null {
  const c = canonicalPhone(input);
  if (!c) return null;
  return c.slice(3); // drop "+62"
}
