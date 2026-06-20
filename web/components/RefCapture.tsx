"use client";

// web/components/RefCapture.tsx — remember a referral code from /?ref=CD1234.
// Stored in the `cd_ref` cookie (45 days) so the checkout API can read it
// server-side and stamp it onto the order. No UI.
import { useEffect } from "react";

export default function RefCapture() {
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref && /^CD[0-9A-Za-z]{2,24}$/.test(ref)) {
        const maxAge = 60 * 60 * 24 * 45; // 45 days
        document.cookie = `cd_ref=${encodeURIComponent(ref)}; path=/; max-age=${maxAge}; samesite=lax`;
      }
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
