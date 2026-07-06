"use client";

// web/app/tbs/success/page.tsx — TotalBuahStore order confirmation.
import { useEffect } from "react";
import Link from "next/link";
import { GREEN, RED, CREAM, TbsCherry } from "../shared";
import { useLang } from "@/lib/i18n";

export default function TbsSuccessPage() {
  const { t } = useLang();
  // Midtrans finish-redirects (bank/e-wallet app flows) land here WITHOUT the
  // snap popup's onSuccess having run — clear the paid basket so the customer
  // can't accidentally pay for the same groceries twice. Only on a confirmed
  // payment status; pending flows keep the basket (webhook decides later).
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const st = (q.get("transaction_status") || "").toLowerCase();
      if (st === "settlement" || st === "capture") {
        const raw = JSON.parse(localStorage.getItem("tbs_basket") || "null");
        if (raw?.store) {
          localStorage.setItem("tbs_basket", JSON.stringify({ store: raw.store, items: {} }));
          window.dispatchEvent(new Event("tbs-basket"));
        }
      }
    } catch { /* ignore */ }
  }, []);
  return (
    <main style={{ minHeight: "70vh", background: CREAM, display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ textAlign: "center", maxWidth: 440, background: "#fff", borderRadius: 18, border: "1px solid rgba(0,0,0,0.07)", padding: "30px 22px" }}>
        <TbsCherry size={46} />
        <h1 style={{ fontSize: 22, fontWeight: 900, color: GREEN, margin: "12px 0 6px" }}>{t("ok.received")}</h1>
        <p style={{ color: "#666", fontSize: 14, lineHeight: 1.65 }}>
          {t("ok.preparing")}
        </p>
        <div style={{ display: "grid", gap: 8, marginTop: 18 }}>
          <Link href="/account/orders" style={{ textDecoration: "none", background: GREEN, color: "#fff", fontWeight: 900, fontSize: 14, padding: "12px", borderRadius: 10 }}>{t("ok.viewOrders")}</Link>
          <Link href="/tbs" style={{ textDecoration: "none", border: `1.5px solid ${RED}`, color: RED, fontWeight: 900, fontSize: 14, padding: "11px", borderRadius: 10 }}>{t("ok.keepShopping")}</Link>
        </div>
      </div>
    </main>
  );
}
