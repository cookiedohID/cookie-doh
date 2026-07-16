"use client";
// web/components/HolidayGate.tsx — CATALOG MODE. Browsing stays open; only the
// Cookie Doh checkout page shows the warm HolidaySplash while ordering is paused.
// usePathname resolves during SSR too, so the splash is in the first paint.
import { usePathname } from "next/navigation";
import { holidayActive, isOrderingPath } from "@/lib/holiday";
import HolidaySplash from "@/components/HolidaySplash";

export default function HolidayGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  if (holidayActive() && isOrderingPath(pathname)) return <HolidaySplash />;
  return <>{children}</>;
}
