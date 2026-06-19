// web/lib/whatsapp.ts
//
// WhatsApp sending via Fonnte (https://fonnte.com).
// Set env: FONNTE_TOKEN (device token) and ADMIN_NOTIFY_WHATSAPP (number to alert).
// Numbers may be in 08xx, 628xx, or +628xx form — normalized to 628xx for Fonnte.

export function normalizeWaNumber(input?: string | null): string | null {
  if (!input) return null;
  let n = String(input).replace(/[^\d+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  if (n.startsWith("0")) n = "62" + n.slice(1); // 08xx -> 628xx
  if (n.startsWith("8")) n = "62" + n; // 8xx -> 628xx
  // already 62xx
  return n || null;
}

export async function sendWhatsApp(params: {
  to?: string | null;
  message: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const token = process.env.FONNTE_TOKEN;
  const to = normalizeWaNumber(params.to || process.env.ADMIN_NOTIFY_WHATSAPP);

  if (!token) {
    console.warn("[whatsapp] FONNTE_TOKEN missing — skipping WhatsApp send");
    return { ok: false, skipped: true };
  }
  if (!to) {
    console.warn("[whatsapp] No recipient — skipping WhatsApp send");
    return { ok: false, skipped: true };
  }

  // Retry only on network-level failures (the fetch throws — e.g. a transient
  // "fetch failed" reaching Fonnte). A real Fonnte response (auth/quota/invalid
  // number) is deterministic, so we return it without retrying.
  const MAX_ATTEMPTS = 3;
  let lastError = "send failed";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          target: to,
          message: params.message,
          countryCode: "62",
        }),
      });

      const json: any = await res.json().catch(() => ({}));
      if (!res.ok || json?.status === false) {
        const error = json?.reason || json?.error || `Fonnte error (${res.status})`;
        console.error("[whatsapp] send failed:", error);
        return { ok: false, error };
      }
      return { ok: true };
    } catch (e: any) {
      lastError = e?.message || "send failed";
      console.error(`[whatsapp] send threw (attempt ${attempt}/${MAX_ATTEMPTS}):`, lastError);
      if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return { ok: false, error: lastError };
}
