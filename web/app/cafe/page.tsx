"use client";

// web/app/cafe/page.tsx — in-store self-checkout / register POS (kiosk)
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FLAVORS, BOX_PRICES } from "@/lib/catalog";
import { SMOOTHIES, SMOOTHIE_PRICE } from "@/lib/smoothies";
import { ASSORTMENTS, type Assortment } from "@/lib/assortments";
import { BUNDLES, getBundle } from "@/lib/bundles";
import { bestRepackage, repackSummary, type RepackResult } from "@/lib/bundleDeals";
import { COLORS } from "@/lib/theme";

const COOKIE_PRICE = 32500;
const POPULAR_BADGE = ["Best Seller", "Bestseller", "Signature", "House Favorite", "Fan Favorite", "Crowd Favourite", "Crowd Favorite"];
const formatIDR = (n: number) => `Rp ${Number(n).toLocaleString("id-ID")}`;

// ⚠️ Conservative defaults — CONFIRM/REPLACE with real kitchen allergen data.
// Over-warning is safe; under-warning is dangerous. Edit per item if needed.
const COOKIE_ALLERGENS = "Contains: gluten (wheat), milk, egg. May contain: tree nuts, peanuts, soy.";
const DRINK_ALLERGENS = "Contains: milk. May contain: tree nuts, peanuts.";

type Kind = "cookie" | "drink";
type MenuItem = {
  id: string; name: string; image?: string; price: number; kind: Kind;
  description?: string; ingredients?: string[]; allergens?: string;
};
type Line = { item: MenuItem; qty: number; free?: boolean };

export default function CafePOS() {
  const router = useRouter();
  const [cart, setCart] = useState<Record<string, Line>>({});
  const [memberPhone, setMemberPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rewards, setRewards] = useState<{ name: string | null; freeCookies: number; freeDrinks: number; cookieStamps: number; drinkStamps: number } | null>(null);
  const [redeemKind, setRedeemKind] = useState<Kind | null>(null);
  // Redemption requires an OTP the MEMBER receives on WhatsApp — so staff can't
  // redeem someone's rewards without the member approving. Verified per order.
  const [redeemVerified, setRedeemVerified] = useState(false);
  const [otp, setOtp] = useState<{ open: boolean; code: string; busy: boolean; note: string; sent: boolean }>({ open: false, code: "", busy: false, note: "", sent: false });
  // Free-reward picker: a focused popup showing only single cookies/drinks,
  // capped at the member's free quantity (no hunting through the full menu).
  const [freePicker, setFreePicker] = useState<{ open: boolean; kind: Kind | null }>({ open: false, kind: null });
  const [pendingRedeemKind, setPendingRedeemKind] = useState<Kind | null>(null);
  const [detail, setDetail] = useState<MenuItem | null>(null);
  // Boxes: pick any N cookies at the box price.
  const [boxes, setBoxes] = useState<{ key: string; size: number; items: { id: string; name: string; qty: number }[]; label?: string; assortKey?: string }[]>([]);
  const [boxBuild, setBoxBuild] = useState<{ size: number; picks: Record<string, { name: string; qty: number }> } | null>(null);
  const [review, setReview] = useState(false); // order summary screen before paying
  // Bundles: fixed-price set of X cookies + Y drinks (customer picks).
  const [bundles, setBundles] = useState<{ key: string; bundleId: string; label: string; price: number; cookies: { id: string; name: string; qty: number }[]; drinks: { id: string; name: string; qty: number }[] }[]>([]);
  const [bundleBuild, setBundleBuild] = useState<{ bundleId: string; cookiePicks: Record<string, { name: string; qty: number }>; drinkPicks: Record<string, { name: string; qty: number }>; fold?: { boxKeys: string[] }; editKey?: string } | null>(null);
  const [scanning, setScanning] = useState(false); // member QR camera scan
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // paid / print phase
  const [paid, setPaid] = useState<{ orderNo: string; lines: Line[]; total: number } | null>(null);
  const [calibrate, setCalibrate] = useState(false);
  const [printDoc, setPrintDoc] = useState<"receipt" | "stickers" | "recipe">("receipt");

  const cookies: MenuItem[] = useMemo(
    () => FLAVORS.map((f: any) => ({
      id: String(f.id), name: String(f.name), image: f.image, price: COOKIE_PRICE, kind: "cookie" as const,
      description: f.description, ingredients: f.ingredients, allergens: COOKIE_ALLERGENS,
    })),
    []
  );
  const drinks: MenuItem[] = useMemo(
    () => SMOOTHIES.map((s) => ({
      id: s.id, name: s.name, image: s.image, price: SMOOTHIE_PRICE, kind: "drink" as const,
      description: s.description, ingredients: s.ingredients, allergens: DRINK_ALLERGENS,
    })),
    []
  );
  const sections = useMemo(
    () => [
      { id: "cookies", label: "🍪 Cookies", items: cookies },
      { id: "drinks", label: "🥤 Drinks", items: drinks },
    ],
    [cookies, drinks]
  );

  const lines = Object.entries(cart).map(([key, l]) => ({ key, ...l }));
  const boxPrice = (size: number) => (BOX_PRICES as any)[size] || 0;
  const itemsTotal = lines.reduce((s, l) => s + (l.free ? 0 : l.item.price * l.qty), 0);
  const boxesTotal = boxes.reduce((s, b) => s + boxPrice(b.size), 0);
  const bundlesTotal = bundles.reduce((s, b) => s + b.price, 0);
  const total = itemsTotal + boxesTotal + bundlesTotal;
  const paidCount = lines.reduce((s, l) => s + (l.free ? 0 : l.qty), 0);
  const freeCount = lines.reduce((s, l) => s + (l.free ? l.qty : 0), 0);
  // Can proceed if there's anything in the cart — including a free-only redemption.
  const payable = paidCount > 0 || boxes.length > 0 || bundles.length > 0 || freeCount > 0;

  // Box upsell: single cookies cost more per cookie than a box (Rp30,000/cookie).
  // Nudge the customer toward a box once they have 3+ singles so they don't overpay.
  const singleCookieCount = lines.reduce((s, l) => s + (l.item.kind === "cookie" && !l.free ? l.qty : 0), 0);
  const singleCookieSpend = lines.reduce((s, l) => s + (l.item.kind === "cookie" && !l.free ? l.qty * l.item.price : 0), 0);
  const boxPerCookie = (BOX_PRICES as any)[3] / 3; // 30,000
  const boxSavings = Math.max(0, Math.round(singleCookieSpend - singleCookieCount * boxPerCookie));
  const showBoxNudge = singleCookieCount >= 3 && boxSavings > 0;

  // Bundle-completion upsell: when the loose cookies + drinks PLUS any cookies in
  // build-your-own boxes are 1–2 short of a fixed-price bundle that genuinely saves,
  // offer to fold them into the bundle. (Assortments are left intact — a curated pick.)
  const looseDrinkCount = lines.reduce((s, l) => s + (l.item.kind === "drink" && !l.free ? l.qty : 0), 0);
  const plainBoxes = boxes.filter((b) => !b.assortKey);
  const plainBoxCookieCount = plainBoxes.reduce((s, b) => s + b.items.reduce((ss, it) => ss + it.qty, 0), 0);
  const plainBoxPaid = plainBoxes.reduce((s, b) => s + boxPrice(b.size), 0);
  const fillCookie = useMemo(() => {
    const list = FLAVORS as any[];
    const pick = list.find((f) => Array.isArray(f.badges) && f.badges.some((b: string) => POPULAR_BADGE.includes(b)) && !f.soldOut) || list.find((f) => !f.soldOut);
    return pick ? { id: String(pick.id), name: String(pick.name) } : null;
  }, []);
  const fillDrink = useMemo(() => {
    const pick = SMOOTHIES.find((s) => Array.isArray(s.badges) && s.badges.some((b) => POPULAR_BADGE.includes(b)) && !s.soldOut) || SMOOTHIES.find((s) => !s.soldOut);
    return pick ? { id: String(pick.id), name: String(pick.name) } : null;
  }, []);
  const bundleDeal = useMemo(() => {
    const cookies = singleCookieCount + plainBoxCookieCount;
    const drinks = looseDrinkCount;
    if (cookies + drinks < 1) return null;
    const paid = singleCookieCount * COOKIE_PRICE + looseDrinkCount * SMOOTHIE_PRICE + plainBoxPaid;
    const opts = BUNDLES.map((b) => {
      const needC = b.cookies - cookies;
      const needD = b.drinks - drinks;
      if (needC < 0 || needD < 0) return null;
      const short = needC + needD;
      if (short < 1 || short > 2) return null;
      if (needC > 0 && !fillCookie) return null;
      if (needD > 0 && !fillDrink) return null;
      const shortCost = needC * COOKIE_PRICE + needD * SMOOTHIE_PRICE;
      const savings = paid + shortCost - b.price;
      if (savings < 10000) return null;
      return { b, needC, needD, short, savings, marginal: b.price - paid };
    }).filter(Boolean) as { b: (typeof BUNDLES)[number]; needC: number; needD: number; short: number; savings: number; marginal: number }[];
    opts.sort((a, z) => a.short - z.short || z.savings - a.savings);
    return opts[0] || null;
  }, [singleCookieCount, looseDrinkCount, plainBoxCookieCount, plainBoxPaid, fillCookie, fillDrink]);

  // "Best deal" repackaging: cheapest way to price the LOOSE cookies + drinks the
  // customer already has, using bundles + leftovers (opt-in, never adds anything).
  const bestDeal = useMemo(() => bestRepackage(singleCookieCount, looseDrinkCount), [singleCookieCount, looseDrinkCount]);

  const boxPickCount = boxBuild ? Object.values(boxBuild.picks).reduce((s, v) => s + v.qty, 0) : 0;
  const bundleCookieCount = bundleBuild ? Object.values(bundleBuild.cookiePicks).reduce((s, v) => s + v.qty, 0) : 0;
  const bundleDrinkCount = bundleBuild ? Object.values(bundleBuild.drinkPicks).reduce((s, v) => s + v.qty, 0) : 0;

  const usedFree = (kind: Kind) => lines.filter((l) => l.free && l.item.kind === kind).reduce((s, l) => s + l.qty, 0);
  const remainingFree = (kind: Kind) =>
    Math.max(0, (kind === "cookie" ? rewards?.freeCookies || 0 : rewards?.freeDrinks || 0) - usedFree(kind));

  // Printer calibration / print preview: ?calibrate=1 shows the 3 docs (no payment).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("calibrate") === "1") {
      setCalibrate(true);
      setPaid({
        orderNo: "PREVIEW",
        total: COOKIE_PRICE * 2 + SMOOTHIE_PRICE,
        lines: [
          { item: { id: "the-one", name: "The One", price: COOKIE_PRICE, kind: "cookie" }, qty: 2 },
          { item: { id: "ruby-glow", name: "Ruby Glow", price: SMOOTHIE_PRICE, kind: "drink", ingredients: ["Plain yoghurt base", "Strawberry", "Dragon fruit", "Honey"] }, qty: 1 },
          { item: { id: "the-one", name: "The One", price: COOKIE_PRICE, kind: "cookie" }, qty: 1, free: true },
        ],
      });
    }
  }, []);

  // After a real payment, return to the attract screen for the next customer.
  useEffect(() => {
    if (paid && !calibrate) {
      const t = setTimeout(() => router.replace("/cafe/start"), 12000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paid, calibrate]);

  // Idle timeout: 5 minutes with no interaction → back to the attract screen.
  useEffect(() => {
    if (paid) return; // the paid screen has its own redirect
    let t: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(() => router.replace("/cafe/start"), 5 * 60 * 1000);
    };
    reset();
    const events = ["pointerdown", "keydown", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(t);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paid]);

  // Member QR camera scan (native BarcodeDetector — Chrome/Edge). Stops the
  // camera + detection loop on unmount/cancel.
  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;
    const BD = (window as any).BarcodeDetector;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = videoRef.current;
        if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
        const detector = new BD({ formats: ["qr_code"] });
        const loop = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const raw = codes && codes[0] ? String(codes[0].rawValue || "").trim() : "";
            if (raw) { onScanned(raw); return; }
          } catch {}
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch {
        setErr("Couldn't open the camera. Allow camera access, or enter the member's phone.");
        setScanning(false);
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  function add(item: MenuItem) {
    // Keys include the kind: two SKUs (ruby-glow, strawberry-kiss) exist as BOTH
    // a cookie and a smoothie, so keying by id alone would collapse them.
    if (redeemKind === item.kind && remainingFree(item.kind) > 0) {
      const key = `free:${item.kind}:${item.id}`;
      setCart((c) => ({ ...c, [key]: { item, qty: (c[key]?.qty || 0) + 1, free: true } }));
      setRedeemKind(null);
      return;
    }
    const key = `${item.kind}:${item.id}`;
    setCart((c) => ({ ...c, [key]: { item, qty: (c[key]?.qty || 0) + 1 } }));
  }
  function bump(key: string, d: number) {
    setCart((c) => {
      const cur = c[key];
      if (!cur) return c;
      const qty = cur.qty + d;
      const next = { ...c };
      if (qty <= 0) delete next[key];
      else next[key] = { ...cur, qty };
      return next;
    });
  }

  async function checkRewards() {
    if (!memberPhone) return;
    const r = await fetch("/api/loyalty/lookup", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: memberPhone }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      setRewards({ name: r.name, freeCookies: r.freeCookies, freeDrinks: r.freeDrinks, cookieStamps: r.cookieStamps ?? 0, drinkStamps: r.drinkStamps ?? 0 });
      setErr("");
    } else {
      setRewards(null);
      setErr(r?.error || "No member found for that phone.");
    }
  }

  function startScan() {
    if (typeof window === "undefined") return;
    if (!(window as any).BarcodeDetector) {
      setErr("QR scanning isn't supported on this device — enter the member's phone instead.");
      return;
    }
    setErr("");
    setScanning(true);
  }
  async function onScanned(code: string) {
    setScanning(false);
    const r = await fetch("/api/loyalty/lookup", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      if (r.phone) setMemberPhone(r.phone);
      setRewards({ name: r.name, freeCookies: r.freeCookies, freeDrinks: r.freeDrinks, cookieStamps: r.cookieStamps ?? 0, drinkStamps: r.drinkStamps ?? 0 });
      setErr("");
    } else {
      setErr(r?.error || "Member not found for that QR.");
    }
  }

  // Detach the current member from the order (e.g. a customer says "that's not me").
  function clearMember() {
    setMemberPhone(""); setRewards(null); setRedeemKind(null); setRedeemVerified(false);
    setOtp({ open: false, code: "", busy: false, note: "", sent: false });
    setFreePicker({ open: false, kind: null }); setPendingRedeemKind(null);
    setCart((c) => Object.fromEntries(Object.entries(c).filter(([, l]) => !l.free)));
  }

  function reset() { setCart({}); setMemberPhone(""); setRewards(null); setRedeemKind(null); setRedeemVerified(false); setOtp({ open: false, code: "", busy: false, note: "", sent: false }); setFreePicker({ open: false, kind: null }); setPendingRedeemKind(null); setBoxes([]); setBundles([]); setBundleBuild(null); setReview(false); }

  // Redemption OTP: send a code to the member's WhatsApp, then verify it before
  // any free reward can be applied.
  async function sendRedeemOtp() {
    if (!memberPhone) return;
    setOtp((o) => ({ ...o, busy: true, note: "" }));
    const r = await fetch("/api/loyalty/redeem-otp/send", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: memberPhone }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) setOtp((o) => ({ ...o, busy: false, sent: true, note: "Code sent to the member's WhatsApp." }));
    else setOtp((o) => ({ ...o, busy: false, note: r?.error || "Couldn't send the code." }));
  }
  async function verifyRedeemOtp() {
    setOtp((o) => ({ ...o, busy: true, note: "" }));
    const r = await fetch("/api/loyalty/redeem-otp/verify", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: memberPhone, code: otp.code }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      setRedeemVerified(true);
      setOtp({ open: false, code: "", busy: false, note: "", sent: false });
      if (pendingRedeemKind) { setFreePicker({ open: true, kind: pendingRedeemKind }); setPendingRedeemKind(null); }
    } else setOtp((o) => ({ ...o, busy: false, note: r?.error || "Incorrect code." }));
  }
  // Staff taps "Use free X" — require the member's WhatsApp OTP first, then open
  // a focused picker (capped at the free quantity).
  function requestRedeem(kind: Kind) {
    if (!redeemVerified) { setPendingRedeemKind(kind); setOtp({ open: true, code: "", busy: false, note: "", sent: false }); return; }
    setFreePicker({ open: true, kind });
  }

  // Add/remove a free item from the picker, capped at the member's available count.
  function bumpFree(item: MenuItem, d: number) {
    const key = `free:${item.kind}:${item.id}`;
    setCart((c) => {
      const available = item.kind === "cookie" ? (rewards?.freeCookies || 0) : (rewards?.freeDrinks || 0);
      const usedNow = Object.values(c).filter((l: any) => l.free && l.item.kind === item.kind).reduce((s: number, l: any) => s + l.qty, 0);
      if (d > 0 && usedNow >= available) return c; // at the free limit
      const next = Math.max(0, (c[key]?.qty || 0) + d);
      const out: any = { ...c };
      if (next <= 0) delete out[key];
      else out[key] = { item, qty: next, free: true };
      return out;
    });
  }

  // ---- box builder ----
  function bumpPick(item: MenuItem, d: number) {
    setBoxBuild((bb) => {
      if (!bb) return bb;
      const cur = bb.picks[item.id]?.qty || 0;
      const others = Object.entries(bb.picks).reduce((s, [k, v]) => s + (k === item.id ? 0 : v.qty), 0);
      let next = cur + d;
      if (next < 0) next = 0;
      if (others + next > bb.size) next = bb.size - others; // can't exceed box size
      const picks = { ...bb.picks };
      if (next <= 0) delete picks[item.id];
      else picks[item.id] = { name: item.name, qty: next };
      return { ...bb, picks };
    });
  }
  function addBox() {
    if (!boxBuild || boxPickCount !== boxBuild.size) return;
    const items = Object.entries(boxBuild.picks).map(([id, v]) => ({ id, name: v.name, qty: v.qty }));
    setBoxes((bs) => [...bs, { key: `box-${boxBuild.size}-${Math.random().toString(36).slice(2, 9)}`, size: boxBuild.size, items }]);
    setBoxBuild(null);
  }
  function removeBox(key: string) { setBoxes((bs) => bs.filter((b) => b.key !== key)); }

  // One-tap "complete the box": pack the loose single cookies into the largest box
  // that fits (no extra cookies added) — a pure saving the staff can offer.
  function makeBoxFromSingles() {
    const flat: { key: string; id: string; name: string }[] = [];
    for (const [key, l] of Object.entries(cart)) {
      if (l.item.kind === "cookie" && !l.free) {
        for (let i = 0; i < l.qty; i++) flat.push({ key, id: l.item.id, name: l.item.name });
      }
    }
    if (flat.length < 3) return;
    const target = flat.length >= 6 ? 6 : 3;
    const taken = flat.slice(0, target);

    const itemsMap: Record<string, { id: string; name: string; qty: number }> = {};
    const removeCount: Record<string, number> = {};
    for (const c of taken) {
      itemsMap[c.id] = itemsMap[c.id] || { id: c.id, name: c.name, qty: 0 };
      itemsMap[c.id].qty += 1;
      removeCount[c.key] = (removeCount[c.key] || 0) + 1;
    }

    setCart((prev) => {
      const next = { ...prev };
      for (const [key, n] of Object.entries(removeCount)) {
        const line = next[key];
        if (!line) continue;
        const q = line.qty - n;
        if (q <= 0) delete next[key];
        else next[key] = { ...line, qty: q };
      }
      return next;
    });
    setBoxes((bs) => [...bs, { key: `box-${target}-${Math.random().toString(36).slice(2, 9)}`, size: target, items: Object.values(itemsMap) }]);
  }

  // "Complete the bundle" → open the bundle builder PRE-SEEDED with the cart's
  // cookies + drinks (loose + build-your-own boxes) and the shortfall suggested with
  // a bestseller. The user reviews/swaps and confirms — the final decision is theirs.
  // On commit, addBundle removes the folded loose items + boxes (via `fold`).
  function startBundleUpsell(deal: { b: (typeof BUNDLES)[number]; needC: number; needD: number }) {
    const { b, needC, needD } = deal;
    const cookiePicks: Record<string, { name: string; qty: number }> = {};
    const drinkPicks: Record<string, { name: string; qty: number }> = {};
    for (const l of Object.values(cart)) {
      if (l.free) continue;
      if (l.item.kind === "cookie") cookiePicks[l.item.id] = { name: l.item.name, qty: (cookiePicks[l.item.id]?.qty || 0) + l.qty };
      else if (l.item.kind === "drink") drinkPicks[l.item.id] = { name: l.item.name, qty: (drinkPicks[l.item.id]?.qty || 0) + l.qty };
    }
    const boxKeys: string[] = [];
    for (const bx of boxes) {
      if (bx.assortKey) continue;
      for (const it of bx.items) cookiePicks[it.id] = { name: it.name, qty: (cookiePicks[it.id]?.qty || 0) + it.qty };
      boxKeys.push(bx.key);
    }
    if (needC > 0 && fillCookie) cookiePicks[fillCookie.id] = { name: fillCookie.name, qty: (cookiePicks[fillCookie.id]?.qty || 0) + needC };
    if (needD > 0 && fillDrink) drinkPicks[fillDrink.id] = { name: fillDrink.name, qty: (drinkPicks[fillDrink.id]?.qty || 0) + needD };
    setBundleBuild({ bundleId: b.id, cookiePicks, drinkPicks, fold: { boxKeys } });
  }

  // Edit an existing bundle: reopen the builder seeded with its current picks.
  function startBundleEdit(bd: (typeof bundles)[number]) {
    const cookiePicks: Record<string, { name: string; qty: number }> = {};
    const drinkPicks: Record<string, { name: string; qty: number }> = {};
    for (const c of bd.cookies) cookiePicks[c.id] = { name: c.name, qty: c.qty };
    for (const d of bd.drinks) drinkPicks[d.id] = { name: d.name, qty: d.qty };
    setBundleBuild({ bundleId: bd.bundleId, cookiePicks, drinkPicks, editKey: bd.key });
  }

  // Opt-in "best deal": repackage the loose cookies + drinks into the cheapest bundle
  // combination, leaving the rest as singles. Builds the bundle(s) from the actual
  // loose items and removes exactly what was consumed.
  function applyBestDeal(r: RepackResult) {
    const cookieQ: { id: string; name: string }[] = [];
    const drinkQ: { id: string; name: string }[] = [];
    for (const l of Object.values(cart)) {
      if (l.free) continue;
      for (let i = 0; i < l.qty; i++) {
        if (l.item.kind === "cookie") cookieQ.push({ id: l.item.id, name: l.item.name });
        else if (l.item.kind === "drink") drinkQ.push({ id: l.item.id, name: l.item.name });
      }
    }
    let ci = 0;
    let di = 0;
    const consumed: Record<string, number> = {};
    const newBundles: typeof bundles = [];
    for (const x of r.combo) {
      for (let n = 0; n < x.count; n++) {
        const cookiePicks: Record<string, { name: string; qty: number }> = {};
        const drinkPicks: Record<string, { name: string; qty: number }> = {};
        for (let k = 0; k < x.cookies; k++) {
          const it = cookieQ[ci++];
          if (!it) return;
          cookiePicks[it.id] = { name: it.name, qty: (cookiePicks[it.id]?.qty || 0) + 1 };
          consumed[`cookie:${it.id}`] = (consumed[`cookie:${it.id}`] || 0) + 1;
        }
        for (let k = 0; k < x.drinks; k++) {
          const it = drinkQ[di++];
          if (!it) return;
          drinkPicks[it.id] = { name: it.name, qty: (drinkPicks[it.id]?.qty || 0) + 1 };
          consumed[`drink:${it.id}`] = (consumed[`drink:${it.id}`] || 0) + 1;
        }
        newBundles.push({
          key: `bundle-${x.bundleId}-${Math.random().toString(36).slice(2, 9)}`,
          bundleId: x.bundleId, label: x.name, price: x.price,
          cookies: Object.entries(cookiePicks).map(([id, v]) => ({ id, name: v.name, qty: v.qty })),
          drinks: Object.entries(drinkPicks).map(([id, v]) => ({ id, name: v.name, qty: v.qty })),
        });
      }
    }
    setCart((prev) => {
      const next = { ...prev };
      for (const [key, cnt] of Object.entries(consumed)) {
        const line = next[key];
        if (!line) continue;
        const q = line.qty - cnt;
        if (q <= 0) delete next[key];
        else next[key] = { ...line, qty: q };
      }
      return next;
    });
    setBundles((bs) => [...bs, ...newBundles]);
  }
  // Build-your-own boxes (no assortKey), counted per size.
  const boxCount = (size: number) => boxes.filter((b) => b.size === size && !b.assortKey).length;
  function removeOneBox(size: number) {
    setBoxes((bs) => {
      for (let i = bs.length - 1; i >= 0; i--) if (bs[i].size === size && !bs[i].assortKey) return bs.filter((_, idx) => idx !== i);
      return bs;
    });
  }
  // Assortments (pre-filled), counted per assortment.
  const assortmentQty = (key: string) => boxes.filter((b) => b.assortKey === key).length;
  function addAssortment(a: Assortment) {
    const items = a.items.map((it) => ({ id: it.flavorId, name: cookies.find((c) => c.id === it.flavorId)?.name || it.flavorId, qty: it.qty }));
    setBoxes((bs) => [...bs, { key: `assort-${a.key}-${Math.random().toString(36).slice(2, 9)}`, size: a.boxSize, items, label: a.title, assortKey: a.key }]);
  }
  function removeOneAssortment(key: string) {
    setBoxes((bs) => {
      for (let i = bs.length - 1; i >= 0; i--) if (bs[i].assortKey === key) return bs.filter((_, idx) => idx !== i);
      return bs;
    });
  }

  // ---- bundles ----
  const bundleCount = (bundleId: string) => bundles.filter((b) => b.bundleId === bundleId).length;
  function removeOneBundle(bundleId: string) {
    setBundles((bs) => {
      for (let i = bs.length - 1; i >= 0; i--) if (bs[i].bundleId === bundleId) return bs.filter((_, idx) => idx !== i);
      return bs;
    });
  }
  function bumpBundlePick(item: MenuItem, d: number) {
    const bundle = getBundle(bundleBuild?.bundleId);
    if (!bundle) return;
    const isCookie = item.kind === "cookie";
    const limit = isCookie ? bundle.cookies : bundle.drinks;
    setBundleBuild((bb) => {
      if (!bb) return bb;
      const picks = isCookie ? { ...bb.cookiePicks } : { ...bb.drinkPicks };
      const cur = picks[item.id]?.qty || 0;
      const others = Object.entries(picks).reduce((s, [k, v]) => s + (k === item.id ? 0 : v.qty), 0);
      let next = cur + d;
      if (next < 0) next = 0;
      if (others + next > limit) next = limit - others;
      if (next <= 0) delete picks[item.id]; else picks[item.id] = { name: item.name, qty: next };
      return isCookie ? { ...bb, cookiePicks: picks } : { ...bb, drinkPicks: picks };
    });
  }
  function addBundle() {
    const bundle = getBundle(bundleBuild?.bundleId);
    if (!bundle || !bundleBuild) return;
    if (bundleCookieCount !== bundle.cookies || bundleDrinkCount !== bundle.drinks) return;
    const cookiesList = Object.entries(bundleBuild.cookiePicks).map(([id, v]) => ({ id, name: v.name, qty: v.qty }));
    const drinksList = Object.entries(bundleBuild.drinkPicks).map(([id, v]) => ({ id, name: v.name, qty: v.qty }));
    // Upsell conversion: remove the loose items + build-your-own boxes we folded in.
    if (bundleBuild.fold) {
      setCart((c) => Object.fromEntries(Object.entries(c).filter(([, l]) => l.free)));
      if (bundleBuild.fold.boxKeys.length) {
        const keys = bundleBuild.fold.boxKeys;
        setBoxes((bs) => bs.filter((x) => !keys.includes(x.key)));
      }
    }
    // Edit: replace the bundle being edited.
    const editKey = bundleBuild.editKey;
    setBundles((bs) => [
      ...(editKey ? bs.filter((x) => x.key !== editKey) : bs),
      { key: `bundle-${bundle.id}-${Math.random().toString(36).slice(2, 9)}`, bundleId: bundle.id, label: bundle.name, price: bundle.price, cookies: cookiesList, drinks: drinksList },
    ]);
    setBundleBuild(null);
  }

  function jump(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function charge() {
    if (!payable) return;
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/cafe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((l) => ({ id: l.item.id, name: l.item.name, kind: l.item.kind, price: l.free ? 0 : l.item.price, quantity: l.qty, free: !!l.free })),
          boxes: boxes.map((b) => ({ size: b.size, items: b.items.map((it) => ({ id: it.id, name: it.name, qty: it.qty })) })),
          bundles: bundles.map((b) => ({ id: b.bundleId, cookies: b.cookies.map((c) => ({ id: c.id, name: c.name, qty: c.qty })), drinks: b.drinks.map((d) => ({ id: d.id, name: d.name, qty: d.qty })) })),
          memberPhone: memberPhone || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) { setErr(j?.error || "Checkout failed"); return; }

      const snapshot = { orderNo: String(j.order_no || j.order_id), lines: [...lines], total };

      // Free-only redemption: nothing to charge — it's already done server-side.
      if (j.free) { setPaid(snapshot); reset(); return; }

      const snap = (window as any).snap;
      if (snap?.pay) {
        snap.pay(j.snap_token, {
          onSuccess: () => { setPaid(snapshot); reset(); },
          onPending: () => { setPaid(snapshot); reset(); },
          onError: () => setErr("Payment failed — try again."),
          onClose: () => setErr("Payment cancelled."),
        });
      } else {
        setErr("Payment widget not loaded. Refresh and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  // ---------------- PRINT PREVIEW (calibration only) ----------------
  if (paid && calibrate) {
    const drinkLines = paid.lines.filter((l) => l.item.kind === "drink");
    return (
      <main style={{ minHeight: "100vh", background: COLORS.bg }}>
        <PrintStyles />
        <div className="cafe-screen" style={{ maxWidth: 520, margin: "0 auto", padding: "32px 16px", textAlign: "center" }}>
          <div style={{ background: "#fff4cc", border: "1px solid #e6c200", borderRadius: 12, padding: "10px 12px", fontWeight: 800, fontSize: 13, color: "#7a5c00", marginBottom: 14 }}>
            🖨️ PRINT PREVIEW — test only, no payment. (In production the print agent sends these to the 3 printers automatically.)
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
            {(["receipt", "stickers", "recipe"] as const).map((d) => (
              <button key={d} onClick={() => setPrintDoc(d)} style={{
                borderRadius: 999, padding: "8px 16px", fontWeight: 800, cursor: "pointer",
                border: printDoc === d ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.15)",
                background: printDoc === d ? "rgba(0,20,167,0.06)" : "#fff", color: COLORS.black,
              }}>{d === "receipt" ? "Receipt" : d === "stickers" ? "Stickers" : "Recipe"}</button>
            ))}
            <button onClick={() => window.print()} style={btn(COLORS.blue)}>Print / Save PDF</button>
          </div>
          <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 16, display: "inline-block", background: "#fff" }}>
            {printDoc === "receipt" ? <Receipt orderNo={paid.orderNo} lines={paid.lines} total={paid.total} /> : null}
            {printDoc === "stickers" ? <Stickers orderNo={paid.orderNo} lines={paid.lines} /> : null}
            {printDoc === "recipe" ? <Recipes orderNo={paid.orderNo} lines={drinkLines} /> : null}
          </div>
        </div>
        <div id="print-area" data-doc={printDoc}>
          {printDoc === "receipt" ? <Receipt orderNo={paid.orderNo} lines={paid.lines} total={paid.total} /> : null}
          {printDoc === "stickers" ? <Stickers orderNo={paid.orderNo} lines={paid.lines} /> : null}
          {printDoc === "recipe" ? <Recipes orderNo={paid.orderNo} lines={drinkLines} /> : null}
        </div>
      </main>
    );
  }

  // ---------------- PAYMENT RECEIVED (real) ----------------
  if (paid) {
    return (
      <main style={{ minHeight: "100vh", background: COLORS.bg, display: "grid", placeItems: "center" }}>
        <div style={{ maxWidth: 460, padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 56 }}>✅</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: COLORS.black, margin: "10px 0 4px" }}>Payment received</h1>
          <p style={{ color: COLORS.muted, fontSize: 15 }}>Order {paid.orderNo} · {formatIDR(paid.total)}</p>
          <p style={{ marginTop: 18, fontSize: 16, fontWeight: 700, color: COLORS.blue }}>🖨️ Printing your receipt, stickers &amp; recipe…</p>
          <p style={{ color: COLORS.muted, fontSize: 13, marginTop: 6 }}>Please collect them at the counter.</p>
          <button onClick={() => router.replace("/cafe/start")} style={{ ...btn(COLORS.blue), marginTop: 28, width: 220 }}>Done</button>
        </div>
      </main>
    );
  }

  // ---------------- REVIEW / ORDER SUMMARY ----------------
  if (review) {
    return (
      <main style={{ minHeight: "100vh", background: COLORS.bg, paddingBottom: 40 }}>
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "20px 16px" }}>
          <button onClick={() => { setReview(false); setErr(""); }} style={{ border: "none", background: "none", color: COLORS.blue, fontWeight: 800, cursor: "pointer", fontSize: 14, padding: 0 }}>← Back to menu</button>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: COLORS.black, margin: "10px 0 16px" }}>Review your order</h1>

          <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, overflow: "hidden" }}>
            {boxes.map((b) => (
              <div key={b.key} style={{ padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, color: COLORS.black }}>
                  <span>📦 {b.label || `Box of ${b.size}`}</span><span>{formatIDR(boxPrice(b.size))}</span>
                </div>
                <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 4 }}>{b.items.map((it) => `${it.qty}× ${it.name}`).join(", ")}</div>
              </div>
            ))}
            {bundles.map((b) => (
              <div key={b.key} style={{ padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, color: COLORS.black }}>
                  <span>🎁 {b.label}</span><span>{formatIDR(b.price)}</span>
                </div>
                <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 4 }}>{[...b.cookies, ...b.drinks].map((it) => `${it.qty}× ${it.name}`).join(", ")}</div>
              </div>
            ))}
            {lines.map((l) => (
              <div key={l.key} style={{ padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", color: COLORS.black }}>
                <span style={{ fontWeight: 700 }}>{l.free ? "🎁 " : ""}{l.qty}× {l.item.name}{l.free ? " (free)" : ""}</span>
                <span style={{ fontWeight: 700 }}>{l.free ? "FREE" : formatIDR(l.item.price * l.qty)}</span>
              </div>
            ))}
            <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 19, color: COLORS.black }}>
              <span>Total</span><span>{formatIDR(total)}</span>
            </div>
          </div>

          {memberPhone ? <div style={{ marginTop: 12, fontSize: 13, color: COLORS.muted }}>Member: {memberPhone}</div> : null}
          {err ? <div style={{ color: "crimson", fontWeight: 700, fontSize: 13, marginTop: 10 }}>{err}</div> : null}

          <button onClick={charge} disabled={busy} style={{ ...btn(COLORS.blue), width: "100%", marginTop: 18, opacity: busy ? 0.6 : 1 }}>{busy ? "…" : total <= 0 ? "🎁 Confirm free redemption" : `Charge QRIS · ${formatIDR(total)}`}</button>
          <p style={{ textAlign: "center", color: COLORS.muted, fontSize: 12.5, marginTop: 10 }}>{total <= 0 ? "No payment needed — this is a free reward." : "Scan the QR with any e-wallet (GoPay, OVO, DANA…) to pay."}</p>
        </div>
      </main>
    );
  }

  // ---------------- SHOP (kiosk) ----------------
  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg, paddingBottom: 160 }}>
      <PrintStyles />
      {/* Kiosk header — matches the storefront header (blue bar, logo, nav) */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: COLORS.blue, borderBottom: "1px solid rgba(255,255,255,0.14)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <Image src="/logo.png" alt="Cookie Doh" width={140} height={28} priority style={{ width: 140, height: "auto", maxWidth: "100%", flex: "0 0 auto" }} />
          <nav style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", overflowX: "auto" }}>
            {[{ id: "assortments", label: "Assortments" }, { id: "boxes", label: "Boxes" }, { id: "bundles", label: "Bundles" }, { id: "cookies", label: "Cookies" }, { id: "drinks", label: "Drinks" }].map((s) => (
              <button key={s.id} onClick={() => jump(s.id)} style={{
                flex: "0 0 auto", border: "1px solid transparent", background: "transparent",
                color: "rgba(255,255,255,0.92)", fontWeight: 800, fontSize: 15, padding: "8px 12px",
                borderRadius: 999, whiteSpace: "nowrap", cursor: "pointer",
              }}>{s.label}</button>
            ))}
          </nav>
        </div>
        {/* Member welcome / anti-misuse banner — whoever's attached is shown big
            and bold, so a customer notices if it isn't them. */}
        {rewards ? (
          <div style={{ background: "#fff" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 16px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: COLORS.blue }}>👋 Welcome, {rewards.name || "Member"}!</span>
              <span style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 14, fontWeight: 800, color: COLORS.black, alignItems: "center" }}>
                <span style={welcomeChip}>🍪 {rewards.cookieStamps}/10</span>
                <span style={welcomeChip}>🥤 {rewards.drinkStamps}/10</span>
                {rewards.freeCookies > 0 ? <span style={welcomeFree}>🎁 {rewards.freeCookies} free cookie ready</span> : null}
                {rewards.freeDrinks > 0 ? <span style={welcomeFree}>🎁 {rewards.freeDrinks} free drink ready</span> : null}
              </span>
              <button onClick={clearMember} style={{ marginLeft: "auto", border: "1px solid rgba(0,0,0,0.18)", background: "#fff", color: COLORS.muted, fontWeight: 800, fontSize: 13, padding: "7px 14px", borderRadius: 999, cursor: "pointer" }}>Not you? ✕</button>
            </div>
          </div>
        ) : (
          <div style={{ background: "rgba(255,255,255,0.10)" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: "7px 16px", fontSize: 13, color: "rgba(255,255,255,0.92)", textAlign: "center", fontWeight: 700 }}>
              Are you a member? Scan your QR below to collect points &amp; redeem rewards 🍪
            </div>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "8px 16px 0" }}>
        {/* Assortments — curated, ready in one tap */}
        <section id="assortments" style={{ scrollMarginTop: 96, paddingTop: 18 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: COLORS.black, margin: "0 0 2px" }}>✨ Assortments</h2>
          <p style={{ fontSize: 13, color: COLORS.muted, margin: "0 0 12px" }}>Curated boxes — ready in one tap.</p>
          <div style={{ display: "grid", gap: 18 }}>
            {ASSORTMENTS.map((a) => {
              const q = assortmentQty(a.key);
              const pics = a.items.map((it) => cookies.find((c) => c.id === it.flavorId)).filter(Boolean) as MenuItem[];
              return (
                <article key={a.key} style={{ borderRadius: 22, overflow: "hidden", background: "#fff", border: q > 0 ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.10)", boxShadow: "0 10px 30px rgba(0,0,0,0.06)" }}>
                  {/* Photo strip — the labelled cookie shots */}
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${pics.length}, 1fr)`, position: "relative" }}>
                    {pics.map((c, i) => (
                      <div key={c.id + i} style={{ position: "relative", aspectRatio: "1/1", background: COLORS.sand }}>
                        {c.image ? <Image src={c.image} alt={c.name} fill style={{ objectFit: "cover" }} sizes="(max-width:768px) 25vw, 280px" /> : null}
                      </div>
                    ))}
                    <span style={{ position: "absolute", top: 12, left: 12, background: COLORS.orange, color: "#fff", fontSize: 12, fontWeight: 800, padding: "5px 11px", borderRadius: 999 }}>{a.badge}</span>
                    {q > 0 ? <span style={{ position: "absolute", top: 12, right: 12, background: COLORS.blue, color: "#fff", borderRadius: 999, minWidth: 30, height: 30, display: "grid", placeItems: "center", fontWeight: 900, fontSize: 14 }}>{q}</span> : null}
                  </div>

                  <div style={{ padding: "18px 18px 20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <span className="font-dearjoe" style={{ fontSize: 18, color: COLORS.blue }}>{a.tagline}</span>
                        <h3 style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 800, color: COLORS.black }}>{a.title} <span style={{ color: COLORS.muted, fontWeight: 700, fontSize: 15 }}>· Box of {a.boxSize}</span></h3>
                      </div>
                      <div style={{ fontWeight: 900, color: COLORS.blue, fontSize: 20 }}>{formatIDR(boxPrice(a.boxSize))}</div>
                    </div>
                    <p style={{ margin: "12px 0 0", color: "#444", lineHeight: 1.55, fontSize: 14.5 }}>{a.description}</p>
                    <div style={{ margin: "14px 0 0", display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {a.items.map((it) => (
                        <span key={it.flavorId} style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.black, background: COLORS.sand, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 999, padding: "5px 11px" }}>
                          {cookies.find((c) => c.id === it.flavorId)?.name || it.flavorId}{it.qty > 1 ? ` ×${it.qty}` : ""}
                        </span>
                      ))}
                    </div>
                    <div style={{ marginTop: 18 }}>
                      {q > 0 ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <button onClick={() => removeOneAssortment(a.key)} aria-label={`Remove one ${a.title}`} style={stepBtn}>–</button>
                          <span style={{ fontWeight: 800, fontSize: 17, minWidth: 18, textAlign: "center" }}>{q}</span>
                          <button onClick={() => addAssortment(a)} aria-label={`Add one ${a.title}`} style={stepBtn}>+</button>
                        </div>
                      ) : (
                        <button onClick={() => addAssortment(a)} style={{ border: "none", borderRadius: 999, padding: "13px 24px", background: COLORS.blue, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 10px 22px rgba(0,0,0,0.08)" }}>＋ Add box · {formatIDR(boxPrice(a.boxSize))}</button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Boxes — pick any N cookies at the box price */}
        <section id="boxes" style={{ scrollMarginTop: 96, paddingTop: 18 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: COLORS.black, margin: "0 0 12px" }}>📦 Boxes</h2>
          <div className="cd-cards-2">
            {[3, 6].map((size) => {
              const q = boxCount(size);
              return (
              <div key={size} style={{
                position: "relative",
                textAlign: "left", border: q > 0 ? `2px solid ${COLORS.blue}` : `1px solid ${COLORS.blue}`, borderRadius: 16, background: "#fff",
                padding: 18, display: "flex", flexDirection: "column", gap: 6,
              }}>
                {q > 0 ? <span style={{ position: "absolute", top: 12, right: 12, background: COLORS.blue, color: "#fff", borderRadius: 999, minWidth: 26, height: 26, display: "grid", placeItems: "center", fontWeight: 900, fontSize: 13 }}>{q}</span> : null}
                <span style={{ fontWeight: 800, fontSize: 17, color: COLORS.black }}>Box of {size}</span>
                <span style={{ fontWeight: 900, fontSize: 18, color: COLORS.blue }}>{formatIDR(boxPrice(size))}</span>
                <span style={{ fontSize: 12.5, color: COLORS.muted }}>Pick any {size} cookies</span>
                <div style={{ marginTop: 6 }}>
                  {q > 0 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <button onClick={() => removeOneBox(size)} aria-label={`Remove a box of ${size}`} style={stepBtn}>–</button>
                      <span style={{ fontWeight: 800, fontSize: 15, minWidth: 16, textAlign: "center" }}>{q}</span>
                      <button onClick={() => setBoxBuild({ size, picks: {} })} aria-label={`Build another box of ${size}`} style={stepBtn}>+</button>
                    </div>
                  ) : (
                    <button onClick={() => setBoxBuild({ size, picks: {} })} style={{ border: `1px solid ${COLORS.blue}`, background: "#fff", color: COLORS.blue, borderRadius: 999, padding: "8px 18px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>＋ Build box</button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </section>

        {/* Bundles — fixed-price cookie + drink sets */}
        <section id="bundles" style={{ scrollMarginTop: 96, paddingTop: 18 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: COLORS.black, margin: "0 0 2px" }}>🎁 Bundles</h2>
          <p style={{ fontSize: 13, color: COLORS.muted, margin: "0 0 12px" }}>Pick your own cookies + drinks at a set price.</p>
          <div className="cd-cards-3">
            {BUNDLES.map((bn) => {
              const q = bundleCount(bn.id);
              return (
              <div key={bn.id} style={{ position: "relative", textAlign: "left", border: q > 0 ? `2px solid ${COLORS.blue}` : `1px solid ${COLORS.blue}`, borderRadius: 16, background: "#fff", padding: 16, display: "flex", flexDirection: "column", gap: 5 }}>
                {q > 0 ? <span style={{ position: "absolute", top: 10, right: 10, background: COLORS.blue, color: "#fff", borderRadius: 999, minWidth: 26, height: 26, display: "grid", placeItems: "center", fontWeight: 900, fontSize: 13 }}>{q}</span> : null}
                {bn.badge ? <span style={{ fontSize: 11, fontWeight: 800, color: COLORS.blue, textTransform: "uppercase", letterSpacing: 0.4 }}>{bn.badge}</span> : null}
                <span style={{ fontWeight: 800, fontSize: 16, color: COLORS.black }}>{bn.name}</span>
                <span style={{ fontWeight: 900, fontSize: 15.5, color: COLORS.blue }}>{formatIDR(bn.price)}</span>
                <span style={{ fontSize: 12.5, color: COLORS.muted, lineHeight: 1.35 }}>{bn.cookies} cookie{bn.cookies > 1 ? "s" : ""} + {bn.drinks} drink{bn.drinks > 1 ? "s" : ""}</span>
                <div style={{ marginTop: 6 }}>
                  {q > 0 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <button onClick={() => removeOneBundle(bn.id)} aria-label={`Remove a ${bn.name}`} style={stepBtn}>–</button>
                      <span style={{ fontWeight: 800, fontSize: 15, minWidth: 16, textAlign: "center" }}>{q}</span>
                      <button onClick={() => setBundleBuild({ bundleId: bn.id, cookiePicks: {}, drinkPicks: {} })} aria-label={`Build another ${bn.name}`} style={stepBtn}>+</button>
                    </div>
                  ) : (
                    <button onClick={() => setBundleBuild({ bundleId: bn.id, cookiePicks: {}, drinkPicks: {} })} style={{ border: `1px solid ${COLORS.blue}`, background: "#fff", color: COLORS.blue, borderRadius: 999, padding: "8px 18px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>＋ Build bundle</button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </section>

        {sections.map((s) => (
          <section key={s.id} id={s.id} style={{ scrollMarginTop: 96, paddingTop: 18 }}>
            <h2 style={{ fontSize: 19, fontWeight: 800, color: COLORS.black, margin: "0 0 12px" }}>{s.label}</h2>
            <div className="cd-cards-4">
              {s.items.map((it) => {
                const key = `${it.kind}:${it.id}`;
                const q = cart[key]?.qty || 0;
                return (
                  <div key={`${it.kind}:${it.id}`} onClick={() => setDetail(it)} role="button" aria-label={`${it.name} — details`} style={{
                    textAlign: "left", border: q > 0 ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.10)",
                    borderRadius: 16, overflow: "hidden", background: "#fff", cursor: "pointer", position: "relative",
                  }}>
                    <div style={{ position: "relative", width: "100%", aspectRatio: "1/1", background: COLORS.sand }}>
                      {it.image ? <Image src={it.image} alt={it.name} fill style={{ objectFit: "cover" }} sizes="(max-width:700px) 50vw, 260px" /> : null}
                      {q > 0 ? <span style={{ position: "absolute", top: 8, right: 8, background: COLORS.blue, color: "#fff", borderRadius: 999, minWidth: 26, height: 26, display: "grid", placeItems: "center", fontWeight: 900, fontSize: 13 }}>{q}</span> : null}
                    </div>
                    <div style={{ padding: "10px 12px" }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: COLORS.black, lineHeight: 1.2, minHeight: 34 }}>{it.name}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                        <span style={{ fontWeight: 800, color: COLORS.blue, fontSize: 13 }}>{formatIDR(it.price)}</span>
                        {q > 0 ? (
                          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button onClick={(e) => { e.stopPropagation(); bump(key, -1); }} aria-label={`Remove one ${it.name}`} style={stepBtn}>–</button>
                            <span style={{ fontWeight: 800, fontSize: 14, minWidth: 14, textAlign: "center" }}>{q}</span>
                            <button onClick={(e) => { e.stopPropagation(); bump(key, 1); }} aria-label={`Add one ${it.name}`} style={stepBtn}>+</button>
                          </div>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); add(it); }} aria-label={`Add ${it.name}`} style={{ border: `1px solid ${COLORS.blue}`, background: "#fff", color: COLORS.blue, borderRadius: 999, padding: "7px 16px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>+ Add</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Detail modal — ingredients + allergens */}
      {detail ? (
        <div onClick={() => setDetail(null)} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, maxWidth: 420, width: "100%", maxHeight: "86vh", overflow: "auto" }}>
            <div style={{ position: "relative", width: "100%", aspectRatio: "1/1", background: "#fff" }}>
              {detail.image ? <Image src={detail.image} alt={detail.name} fill style={{ objectFit: "contain" }} sizes="420px" /> : null}
              <button onClick={() => setDetail(null)} aria-label="Close" style={{ position: "absolute", top: 10, right: 10, width: 32, height: 32, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.95)", fontWeight: 900, cursor: "pointer", fontSize: 16 }}>×</button>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: COLORS.black }}>{detail.name}</h3>
                <span style={{ fontWeight: 800, color: COLORS.blue }}>{formatIDR(detail.price)}</span>
              </div>
              {detail.description ? <p style={{ color: COLORS.muted, fontSize: 14, marginTop: 8 }}>{detail.description}</p> : null}
              {detail.ingredients?.length ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: COLORS.black, marginBottom: 6 }}>Ingredients</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {detail.ingredients.map((ing) => (
                      <span key={ing} style={{ fontSize: 12, fontWeight: 700, color: COLORS.black, background: COLORS.sand, borderRadius: 999, padding: "4px 10px" }}>{ing}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {detail.allergens ? (
                <div style={{ marginTop: 12, background: "#fff4cc", border: "1px solid #e6c200", borderRadius: 12, padding: "10px 12px" }}>
                  <div style={{ fontWeight: 800, fontSize: 12.5, color: "#7a5c00" }}>⚠️ Allergens</div>
                  <div style={{ fontSize: 12.5, color: "#7a5c00", marginTop: 2 }}>{detail.allergens}</div>
                </div>
              ) : null}
              {boxBuild ? (
                <button onClick={() => { bumpPick(detail, 1); setDetail(null); }} disabled={boxPickCount >= boxBuild.size} style={{ ...btn(COLORS.blue), marginTop: 16, width: "100%", opacity: boxPickCount >= boxBuild.size ? 0.5 : 1, cursor: boxPickCount >= boxBuild.size ? "not-allowed" : "pointer" }}>{boxPickCount >= boxBuild.size ? "Box is full" : "＋ Add to box"}</button>
              ) : (
                <button onClick={() => { add(detail); setDetail(null); }} style={{ ...btn(COLORS.blue), marginTop: 16, width: "100%" }}>＋ Add to order</button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Box builder modal */}
      {boxBuild ? (
        <div onClick={() => setBoxBuild(null)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, maxWidth: 640, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(0,0,0,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18, color: COLORS.black }}>Box of {boxBuild.size}</div>
                <div style={{ fontSize: 13, color: boxPickCount === boxBuild.size ? COLORS.blue : COLORS.muted, fontWeight: 700 }}>Pick {boxPickCount}/{boxBuild.size} cookies · {formatIDR(boxPrice(boxBuild.size))}</div>
              </div>
              <button onClick={() => setBoxBuild(null)} aria-label="Close" style={{ width: 32, height: 32, borderRadius: 999, border: "none", background: COLORS.sand, fontWeight: 900, cursor: "pointer", fontSize: 16 }}>×</button>
            </div>
            <div className="cd-picker" style={{ padding: 16, overflow: "auto", flex: 1, minHeight: 0, alignItems: "start" }}>
              {cookies.map((c) => {
                const q = boxBuild.picks[c.id]?.qty || 0;
                const atMax = boxPickCount >= boxBuild.size;
                return (
                  <div key={c.id} style={{ border: q > 0 ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.10)", borderRadius: 14, background: "#fff", display: "flex", flexDirection: "column" }}>
                    <div onClick={() => setDetail(c)} style={{ position: "relative", width: "100%", aspectRatio: "1/1", background: COLORS.sand, flex: "0 0 auto", overflow: "hidden", borderTopLeftRadius: 13, borderTopRightRadius: 13, cursor: "pointer" }}>
                      {c.image ? <Image src={c.image} alt={c.name} fill style={{ objectFit: "cover" }} sizes="200px" /> : null}
                      {q > 0
                        ? <span style={{ position: "absolute", top: 6, right: 6, minWidth: 26, height: 26, padding: "0 7px", borderRadius: 999, background: COLORS.blue, color: "#fff", fontWeight: 900, fontSize: 14, display: "grid", placeItems: "center", pointerEvents: "none", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }}>{q}</span>
                        : <span style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 999, background: "rgba(255,255,255,0.92)", color: COLORS.blue, fontWeight: 900, fontSize: 13, display: "grid", placeItems: "center", pointerEvents: "none", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}>ⓘ</span>}
                    </div>
                    <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                      <div onClick={() => setDetail(c)} style={{ fontWeight: 700, fontSize: 13, color: COLORS.black, minHeight: 34, lineHeight: 1.2, cursor: "pointer" }}>{c.name}</div>
                      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}>
                        <button onClick={() => bumpPick(c, -1)} disabled={q === 0} style={{ ...stepBtn, opacity: q === 0 ? 0.35 : 1 }}>–</button>
                        <span style={{ fontWeight: 800, fontSize: 14, minWidth: 14, textAlign: "center" }}>{q}</span>
                        <button onClick={() => bumpPick(c, 1)} disabled={atMax} title={atMax ? "Box is full" : undefined} style={{ ...stepBtn, opacity: atMax ? 0.35 : 1 }}>+</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: 16, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
              <button onClick={addBox} disabled={boxPickCount !== boxBuild.size} style={{ ...btn(COLORS.blue), width: "100%", opacity: boxPickCount === boxBuild.size ? 1 : 0.5, cursor: boxPickCount === boxBuild.size ? "pointer" : "not-allowed" }}>
                {boxPickCount === boxBuild.size ? `Add box · ${formatIDR(boxPrice(boxBuild.size))}` : `Pick ${boxBuild.size - boxPickCount} more`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Bundle builder modal — pick X cookies + Y drinks */}
      {bundleBuild ? (() => {
        const bn = getBundle(bundleBuild.bundleId);
        if (!bn) return null;
        const ready = bundleCookieCount === bn.cookies && bundleDrinkCount === bn.drinks;
        const atMaxCookies = bundleCookieCount >= bn.cookies;
        const atMaxDrinks = bundleDrinkCount >= bn.drinks;
        const pickerCard = (item: MenuItem, q: number, atMax: boolean) => (
          <div key={item.id} style={{ border: q > 0 ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.10)", borderRadius: 14, background: "#fff", display: "flex", flexDirection: "column" }}>
            <div style={{ position: "relative", width: "100%", aspectRatio: "1/1", background: COLORS.sand, flex: "0 0 auto", overflow: "hidden", borderTopLeftRadius: 13, borderTopRightRadius: 13 }}>
              {item.image ? <Image src={item.image} alt={item.name} fill style={{ objectFit: "cover" }} sizes="160px" /> : null}
              {q > 0 ? <span style={{ position: "absolute", top: 6, right: 6, minWidth: 26, height: 26, padding: "0 7px", borderRadius: 999, background: COLORS.blue, color: "#fff", fontWeight: 900, fontSize: 14, display: "grid", placeItems: "center", pointerEvents: "none", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }}>{q}</span> : null}
            </div>
            <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: COLORS.black, minHeight: 32, lineHeight: 1.2 }}>{item.name}</div>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}>
                <button onClick={() => bumpBundlePick(item, -1)} disabled={q === 0} style={{ ...stepBtn, opacity: q === 0 ? 0.4 : 1 }}>–</button>
                <span style={{ fontWeight: 800, fontSize: 14, minWidth: 14, textAlign: "center" }}>{q}</span>
                <button onClick={() => bumpBundlePick(item, 1)} disabled={atMax} style={{ ...stepBtn, opacity: atMax ? 0.4 : 1 }}>+</button>
              </div>
            </div>
          </div>
        );
        return (
          <div onClick={() => setBundleBuild(null)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, maxWidth: 640, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(0,0,0,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18, color: COLORS.black }}>{bn.name}</div>
                  <div style={{ fontSize: 13, color: ready ? COLORS.blue : COLORS.muted, fontWeight: 700 }}>Cookies {bundleCookieCount}/{bn.cookies} · Drinks {bundleDrinkCount}/{bn.drinks} · {formatIDR(bn.price)}</div>
                  {bundleBuild.fold ? <div style={{ fontSize: 12, color: "#0f6e56", fontWeight: 700, marginTop: 2 }}>✓ Your items are already in — swap any pick, then confirm.</div> : null}
                  {bundleBuild.editKey ? <div style={{ fontSize: 12, color: COLORS.blue, fontWeight: 700, marginTop: 2 }}>Editing your bundle — adjust the picks.</div> : null}
                </div>
                <button onClick={() => setBundleBuild(null)} aria-label="Close" style={{ width: 32, height: 32, borderRadius: 999, border: "none", background: COLORS.sand, fontWeight: 900, cursor: "pointer", fontSize: 16 }}>×</button>
              </div>
              <div style={{ padding: 16, overflow: "auto", flex: 1, minHeight: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: COLORS.black, margin: "0 0 8px" }}>🍪 Cookies ({bundleCookieCount}/{bn.cookies})</div>
                <div className="cd-picker" style={{ alignItems: "start" }}>
                  {cookies.map((c) => pickerCard(c, bundleBuild.cookiePicks[c.id]?.qty || 0, atMaxCookies))}
                </div>
                <div style={{ fontWeight: 800, fontSize: 14, color: COLORS.black, margin: "18px 0 8px" }}>🥤 Drinks ({bundleDrinkCount}/{bn.drinks})</div>
                <div className="cd-picker" style={{ alignItems: "start" }}>
                  {drinks.map((d) => pickerCard(d, bundleBuild.drinkPicks[d.id]?.qty || 0, atMaxDrinks))}
                </div>
              </div>
              <div style={{ padding: 16, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                <button onClick={addBundle} disabled={!ready} style={{ ...btn(COLORS.blue), width: "100%", opacity: ready ? 1 : 0.5, cursor: ready ? "pointer" : "not-allowed" }}>
                  {ready ? `Add bundle · ${formatIDR(bn.price)}` : "Pick your cookies & drinks"}
                </button>
              </div>
            </div>
          </div>
        );
      })() : null}

      {/* Member QR scan camera */}
      {scanning ? (
        <div onClick={() => setScanning(false)} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.85)", display: "grid", placeItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ textAlign: "center", maxWidth: 420, width: "100%" }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18, marginBottom: 12 }}>Scan member QR</div>
            <div style={{ position: "relative", width: "100%", aspectRatio: "1/1", borderRadius: 20, overflow: "hidden", background: "#000" }}>
              <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: "18%", border: "3px solid rgba(255,255,255,0.85)", borderRadius: 16, pointerEvents: "none" }} />
            </div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 12 }}>Point at the member&apos;s QR in their Cookie Doh account.</div>
            <button onClick={() => setScanning(false)} style={{ marginTop: 16, borderRadius: 999, border: "1px solid rgba(255,255,255,0.5)", background: "transparent", color: "#fff", fontWeight: 800, fontSize: 15, padding: "12px 28px", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ) : null}

      {/* Cart bar */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40, background: "#fff", borderTop: "1px solid rgba(0,0,0,0.10)", padding: "12px 16px", boxShadow: "0 -8px 24px rgba(0,0,0,0.06)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {redeemKind ? (
            <div style={{ marginBottom: 8, fontWeight: 800, fontSize: 13, color: "#0014A7" }}>🎁 Tap the {redeemKind} above to add it free</div>
          ) : null}

          {lines.length || boxes.length || bundles.length ? (
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
              {boxes.map((b) => (
                <div key={b.key} style={{ flex: "0 0 auto", border: `1px solid ${COLORS.blue}`, background: "rgba(0,20,167,0.06)", borderRadius: 999, padding: "4px 6px 4px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>📦 {b.label || `Box of ${b.size}`} · {formatIDR(boxPrice(b.size))}</span>
                  <button onClick={() => removeBox(b.key)} aria-label="Remove box" style={miniBtn}>×</button>
                </div>
              ))}
              {bundles.map((b) => (
                <div key={b.key} style={{ flex: "0 0 auto", border: `1px solid ${COLORS.blue}`, background: "rgba(0,20,167,0.06)", borderRadius: 999, padding: "4px 6px 4px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>🎁 {b.label} · {formatIDR(b.price)}</span>
                  <button onClick={() => startBundleEdit(b)} aria-label={`Edit ${b.label}`} style={{ ...miniBtn, width: "auto", padding: "0 8px", fontSize: 12 }}>Edit</button>
                  <button onClick={() => setBundles((bs) => bs.filter((x) => x.key !== b.key))} aria-label="Remove bundle" style={miniBtn}>×</button>
                </div>
              ))}
              {lines.map((l) => (
                <div key={l.key} style={{ flex: "0 0 auto", border: l.free ? `1px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.12)", background: l.free ? "rgba(0,20,167,0.06)" : "#fff", borderRadius: 999, padding: "4px 6px 4px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{l.free ? "🎁 " : ""}{l.item.name}{l.free ? " · FREE" : ""}</span>
                  <button onClick={() => bump(l.key, -1)} style={miniBtn}>–</button>
                  <span style={{ fontWeight: 800, fontSize: 13, minWidth: 14, textAlign: "center" }}>{l.qty}</span>
                  <button onClick={() => bump(l.key, 1)} style={miniBtn}>+</button>
                </div>
              ))}
            </div>
          ) : null}

          {bundleDeal ? (() => {
            const { b, needC, needD, savings, marginal } = bundleDeal;
            const parts: string[] = [];
            if (needC > 0) parts.push(`${needC} cookie${needC > 1 ? "s" : ""}`);
            if (needD > 0) parts.push(`${needD} drink${needD > 1 ? "s" : ""}`);
            const addText = parts.join(" + ");
            return (
              <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 8, padding: "8px 12px", borderRadius: 12, background: "rgba(0,20,167,0.07)", border: `1px solid ${COLORS.blue}` }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: COLORS.blue }}>
                  🎉 {marginal > 0 ? `Add ${addText} (+${formatIDR(marginal)}) → ${b.name}` : `Upgrade to ${b.name}`} · save {formatIDR(savings)}
                </span>
                <button onClick={() => startBundleUpsell(bundleDeal)} style={{ flex: "0 0 auto", border: "none", background: COLORS.blue, color: "#fff", fontWeight: 800, fontSize: 12.5, padding: "7px 14px", borderRadius: 999, cursor: "pointer" }}>Make it the {b.name}</button>
              </div>
            );
          })() : null}

          {bestDeal ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 8, padding: "8px 12px", borderRadius: 12, background: "#FAEEDA", border: "1px solid #EF9F27" }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: "#633806" }}>
                💡 Save {formatIDR(bestDeal.savings)}: take it as {repackSummary(bestDeal)}
              </span>
              <button onClick={() => applyBestDeal(bestDeal)} style={{ flex: "0 0 auto", border: "none", background: "#854F0B", color: "#fff", fontWeight: 800, fontSize: 12.5, padding: "7px 16px", borderRadius: 999, cursor: "pointer" }}>Apply</button>
            </div>
          ) : null}

          {showBoxNudge && !bundleDeal && !bestDeal ? (() => {
            const target = singleCookieCount >= 6 ? 6 : 3;
            const save = target * COOKIE_PRICE - boxPrice(target);
            return (
              <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 8, padding: "8px 12px", borderRadius: 12, background: "#E1F5EE", border: "1px solid rgba(29,158,117,0.35)" }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: "#0f6e56" }}>
                  🎁 {singleCookieCount} singles → make a Box of {target} & save {formatIDR(save)}
                </span>
                <button onClick={makeBoxFromSingles} style={{ flex: "0 0 auto", border: "none", background: COLORS.blue, color: "#fff", fontWeight: 800, fontSize: 12.5, padding: "7px 14px", borderRadius: 999, cursor: "pointer" }}>Make a Box of {target}</button>
              </div>
            );
          })() : null}

          {lines.length > 0 && !lines.some((l) => l.item.kind === "drink") && !bundleDeal && !bestDeal ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 8, padding: "8px 12px", borderRadius: 12, background: "#FFF4E5", border: "1px solid rgba(255,90,0,0.3)" }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: COLORS.black }}>🥤 Add a drink? {formatIDR(SMOOTHIE_PRICE)} each</span>
              <button onClick={() => jump("drinks")} style={{ flex: "0 0 auto", border: "none", background: COLORS.blue, color: "#fff", fontWeight: 800, fontSize: 12.5, padding: "7px 14px", borderRadius: 999, cursor: "pointer" }}>See drinks</button>
            </div>
          ) : null}

          {rewards && (rewards.freeCookies > 0 || rewards.freeDrinks > 0) ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: "#0014A7" }}>
                🎁 {rewards.name ? rewards.name + " · " : ""}{rewards.freeCookies} free cookie · {rewards.freeDrinks} free drink
              </span>
              {remainingFree("cookie") > 0 ? <button onClick={() => requestRedeem("cookie")} style={rewardBtn(redeemKind === "cookie")}>{redeemVerified ? "Use free cookie" : "🔒 Use free cookie"}</button> : null}
              {remainingFree("drink") > 0 ? <button onClick={() => requestRedeem("drink")} style={rewardBtn(redeemKind === "drink")}>{redeemVerified ? "Use free drink" : "🔒 Use free drink"}</button> : null}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: lines.length ? 4 : 0 }}>
            {rewards ? (
              // Member locked in — show who it is + a Cancel to clear (no editable
              // field, so the phone can't be accidentally deleted).
              <>
                <div style={{ flex: 1, minWidth: 0, height: 50, display: "flex", alignItems: "center", gap: 8, padding: "0 14px", borderRadius: 12, background: "rgba(0,20,167,0.06)", border: `1px solid ${COLORS.blue}` }}>
                  <span style={{ fontWeight: 800, color: COLORS.blue, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>👤 {rewards.name || memberPhone}</span>
                </div>
                <button onClick={clearMember} style={{ flex: "0 0 auto", borderRadius: 12, height: 50, padding: "0 16px", border: "1px solid rgba(192,57,43,0.4)", background: "#fff", color: "#C0392B", fontWeight: 800, cursor: "pointer" }}>Cancel</button>
              </>
            ) : (
              <>
                <button onClick={startScan} aria-label="Scan member QR" title="Scan member QR" style={{ flex: "0 0 auto", borderRadius: 12, height: 50, width: 52, border: `1px solid ${COLORS.blue}`, background: "#fff", color: COLORS.blue, fontSize: 20, cursor: "pointer" }}>📷</button>
                <input value={memberPhone} onChange={(e) => { setMemberPhone(e.target.value.replace(/[^\d+]/g, "")); setRewards(null); setRedeemKind(null); setCart((c) => Object.fromEntries(Object.entries(c).filter(([, l]) => !l.free))); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (memberPhone && !rewards) checkRewards(); } }}
                  placeholder="Member phone (optional)" inputMode="tel"
                  style={{ flex: 1, minWidth: 0, padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.16)", fontSize: 14 }} />
                {memberPhone ? (
                  <button onClick={checkRewards} style={{ flex: "0 0 auto", borderRadius: 12, height: 50, padding: "0 16px", border: `1px solid ${COLORS.blue}`, background: "#fff", color: COLORS.blue, fontWeight: 800, cursor: "pointer" }}>Rewards</button>
                ) : null}
              </>
            )}
            <button onClick={() => setReview(true)} disabled={!payable} style={{
              flex: "0 0 auto", borderRadius: 999, height: 50, padding: "0 22px", border: "none",
              background: payable ? COLORS.blue : "rgba(0,20,167,0.4)", color: "#fff", fontWeight: 900, fontSize: 15, cursor: payable ? "pointer" : "not-allowed",
            }}>{`Review · ${formatIDR(total)}`}</button>
          </div>
          {err ? <div style={{ color: "crimson", fontWeight: 700, fontSize: 13, marginTop: 6 }}>{err}</div> : null}
        </div>
      </div>

      {/* Redemption OTP — the member approves on their own WhatsApp */}
      {otp.open ? (
        <div onClick={() => setOtp((o) => ({ ...o, open: false }))} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "grid", placeItems: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, padding: 22, width: "100%", maxWidth: 380 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.black }}>Confirm reward redemption</div>
            <p style={{ marginTop: 6, fontSize: 13.5, color: COLORS.muted, lineHeight: 1.5 }}>
              Send a code to <strong>{rewards?.name || "the member"}</strong>&apos;s WhatsApp ({memberPhone}). They read it back to you to approve using their free reward.
            </p>
            {!otp.sent ? (
              <button onClick={sendRedeemOtp} disabled={otp.busy} style={{ marginTop: 14, width: "100%", border: "none", background: COLORS.blue, color: "#fff", fontWeight: 800, padding: "13px", borderRadius: 999, cursor: "pointer" }}>{otp.busy ? "Sending…" : "Send code to member's WhatsApp"}</button>
            ) : (
              <>
                <input value={otp.code} onChange={(e) => setOtp((o) => ({ ...o, code: e.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="Enter 6-digit code" inputMode="numeric" style={{ marginTop: 14, width: "100%", padding: "13px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.18)", fontSize: 18, letterSpacing: 4, textAlign: "center", boxSizing: "border-box" }} />
                <button onClick={verifyRedeemOtp} disabled={otp.busy || otp.code.length < 6} style={{ marginTop: 10, width: "100%", border: "none", background: otp.code.length >= 6 ? COLORS.blue : "rgba(0,20,167,0.4)", color: "#fff", fontWeight: 800, padding: "13px", borderRadius: 999, cursor: otp.code.length >= 6 ? "pointer" : "not-allowed" }}>{otp.busy ? "Checking…" : "Confirm"}</button>
                <button onClick={sendRedeemOtp} disabled={otp.busy} style={{ marginTop: 8, width: "100%", border: "none", background: "transparent", color: COLORS.muted, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Resend code</button>
              </>
            )}
            {otp.note ? <div style={{ marginTop: 10, fontSize: 13, color: otp.note.toLowerCase().includes("sent") ? COLORS.blue : "crimson", fontWeight: 700 }}>{otp.note}</div> : null}
            <button onClick={() => setOtp({ open: false, code: "", busy: false, note: "", sent: false })} style={{ marginTop: 12, width: "100%", border: "none", background: "transparent", color: COLORS.muted, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ) : null}

      {/* Free-reward picker — only the relevant single items, capped at the free quantity */}
      {freePicker.open && freePicker.kind ? (() => {
        const kind = freePicker.kind as Kind;
        const itemsForKind = kind === "cookie" ? cookies : drinks;
        const available = kind === "cookie" ? (rewards?.freeCookies || 0) : (rewards?.freeDrinks || 0);
        const used = usedFree(kind);
        const atLimit = used >= available;
        return (
          <div onClick={() => setFreePicker({ open: false, kind: null })} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 55, display: "grid", placeItems: "center", padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 600, maxHeight: "86vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: 18, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.black }}>🎁 Choose your free {kind === "cookie" ? "cookies" : "drinks"}</div>
                <div style={{ marginTop: 4, fontSize: 13, color: COLORS.muted }}>{used}/{available} chosen — pick your flavour{available > 1 ? "s" : ""}.</div>
              </div>
              <div style={{ padding: 14, overflowY: "auto", flex: 1 }}>
                <div className="cd-picker" style={{ alignItems: "start" }}>
                  {itemsForKind.map((it) => {
                    const qty = cart[`free:${kind}:${it.id}`]?.qty || 0;
                    return (
                      <div key={it.id} style={{ border: qty > 0 ? `2px solid ${COLORS.blue}` : "1px solid rgba(0,0,0,0.10)", borderRadius: 14, overflow: "hidden", background: "#fff" }}>
                        <div style={{ position: "relative", width: "100%", aspectRatio: "1/1", background: "#f3f0ea" }}>
                          {it.image ? <Image src={it.image} alt={it.name} fill style={{ objectFit: "cover" }} sizes="160px" /> : null}
                          {qty > 0 ? <div style={{ position: "absolute", top: 6, right: 6, background: COLORS.blue, color: "#fff", borderRadius: 999, minWidth: 22, height: 22, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 900, padding: "0 6px" }}>{qty}</div> : null}
                        </div>
                        <div style={{ padding: 8 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 800, color: COLORS.black, lineHeight: 1.2, minHeight: 30 }}>{it.name}</div>
                          <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <button onClick={() => bumpFree(it, -1)} disabled={qty <= 0} style={{ ...stepBtn, opacity: qty <= 0 ? 0.4 : 1 }}>–</button>
                            <span style={{ fontWeight: 800 }}>{qty}</span>
                            <button onClick={() => bumpFree(it, 1)} disabled={atLimit} style={{ ...stepBtn, opacity: atLimit ? 0.4 : 1 }}>+</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ padding: 14, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                <button onClick={() => setFreePicker({ open: false, kind: null })} style={{ width: "100%", height: 50, borderRadius: 999, border: "none", background: COLORS.blue, color: "#fff", fontWeight: 900, fontSize: 16, cursor: "pointer" }}>Done · {used} free {kind === "cookie" ? "cookie" : "drink"}{used !== 1 ? "s" : ""} added</button>
              </div>
            </div>
          </div>
        );
      })() : null}
    </main>
  );
}

const btn = (bg: string): React.CSSProperties => ({ height: 52, borderRadius: 14, border: "none", background: bg, color: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer" });
const miniBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", background: "#fff", fontWeight: 900, cursor: "pointer" };
const stepBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 999, border: `1px solid ${COLORS.blue}`, background: "#fff", color: COLORS.blue, fontWeight: 900, fontSize: 17, lineHeight: 1, cursor: "pointer", display: "grid", placeItems: "center" };
const rewardBtn = (active: boolean): React.CSSProperties => ({ borderRadius: 999, padding: "6px 12px", border: `1px solid #0014A7`, background: active ? "#0014A7" : "#fff", color: active ? "#fff" : "#0014A7", fontWeight: 800, fontSize: 12.5, cursor: "pointer" });
const welcomeChip: React.CSSProperties = { background: "#EAF2FF", color: "#0014A7", borderRadius: 999, padding: "4px 11px", fontWeight: 800 };
const welcomeFree: React.CSSProperties = { background: "#0014A7", color: "#fff", borderRadius: 999, padding: "4px 11px", fontWeight: 800 };

// ---------------- Print docs (thermal, 80mm) — used by the calibration preview ----------------
function PrintStyles() {
  return (
    <style>{`
      @media print {
        @page { size: 80mm auto; margin: 4mm; }
        body { background: #fff; }
        .cafe-screen { display: none !important; }
        #print-area { display: block !important; }
      }
      #print-area { display: none; }
      .doc { width: 72mm; font-family: -apple-system, system-ui, monospace; color: #000; }
      .sticker { width: 72mm; border-bottom: 1px dashed #999; padding: 6px 0 10px; page-break-inside: avoid; }
      .recipe { page-break-after: always; padding-bottom: 10px; }
      /* Responsive POS card grids: 2-up on phones, fuller on the counter screen. */
      .cd-cards-4, .cd-cards-3, .cd-cards-2, .cd-picker { display: grid; gap: 12px; }
      .cd-cards-4, .cd-cards-3, .cd-picker { grid-template-columns: repeat(2, 1fr); }
      .cd-cards-2 { grid-template-columns: 1fr; }
      @media (min-width: 720px) {
        .cd-cards-4 { grid-template-columns: repeat(4, 1fr); }
        .cd-cards-3 { grid-template-columns: repeat(3, 1fr); }
        .cd-cards-2 { grid-template-columns: repeat(2, 1fr); }
        .cd-picker { grid-template-columns: repeat(3, 1fr); }
      }
    `}</style>
  );
}

function Receipt({ orderNo, lines, total }: { orderNo: string; lines: Line[]; total: number }) {
  return (
    <div className="doc" style={{ textAlign: "center" }}>
      <div style={{ fontWeight: 800, fontSize: 16 }}>COOKIE DOH</div>
      <div style={{ fontSize: 11 }}>where the cookie magic happens</div>
      <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
      <div style={{ textAlign: "left", fontSize: 12 }}>Order: {orderNo}</div>
      <div style={{ textAlign: "left", fontSize: 12, marginBottom: 8 }}>{new Date().toLocaleString("id-ID")}</div>
      {lines.map((l, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, textAlign: "left" }}>
          <span>{l.free ? "🎁 " : ""}{l.qty}× {l.item.name}</span>
          <span>{l.free ? "FREE" : formatIDR(l.item.price * l.qty)}</span>
        </div>
      ))}
      <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 14 }}>
        <span>TOTAL</span><span>{formatIDR(total)}</span>
      </div>
      <div style={{ marginTop: 10, fontSize: 11 }}>Thank you 🤍</div>
    </div>
  );
}

function Stickers({ orderNo, lines }: { orderNo: string; lines: Line[] }) {
  const units: string[] = [];
  lines.forEach((l) => { for (let i = 0; i < l.qty; i++) units.push(l.item.name); });
  return (
    <div className="doc">
      {units.map((name, i) => (
        <div className="sticker" key={i}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{name}</div>
          <div style={{ fontSize: 10 }}>Order {orderNo} · Cookie Doh</div>
        </div>
      ))}
    </div>
  );
}

function Recipes({ orderNo, lines }: { orderNo: string; lines: Line[] }) {
  return (
    <div className="doc">
      {lines.map((l, i) => (
        <div className="recipe" key={i}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{l.item.name} ×{l.qty}</div>
          <div style={{ fontSize: 11, marginBottom: 6 }}>Order {orderNo} · make {l.qty}</div>
          <div style={{ borderTop: "1px dashed #000", marginBottom: 6 }} />
          {(l.item.ingredients || []).map((ing, j) => (
            <div key={j} style={{ fontSize: 13 }}>• {ing}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
