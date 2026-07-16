"use client";
// web/components/HolidayBanner.tsx — a slim, warm strip shown across the Cookie
// Doh storefront during CATALOG MODE, so customers know they can browse but that
// ordering is closed. Purely informational — NO "order now" call to action, since
// no orders are being taken during the break. Hidden on staff/TBS surfaces and on
// the checkout page (which shows the full splash). Sits above the sticky header.
import { usePathname } from "next/navigation";
import { holidayActive, isExemptFromHoliday, isOrderingPath, HOLIDAY_RETURN_LABEL } from "@/lib/holiday";

export default function HolidayBanner() {
  const pathname = usePathname() || "/";
  if (!holidayActive() || isExemptFromHoliday(pathname) || isOrderingPath(pathname)) return null;
  return (
    <div
      style={{
        background: "#0014A7",
        color: "#fff",
        textAlign: "center",
        fontSize: 13,
        lineHeight: 1.45,
        fontWeight: 600,
        padding: "9px 14px",
      }}
    >
      🍪 We&apos;re upgrading! <b>Have a browse</b> — online ordering is back in{" "}
      <b>{HOLIDAY_RETURN_LABEL}</b>. 💛
    </div>
  );
}
