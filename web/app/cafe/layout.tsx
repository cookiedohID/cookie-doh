// web/app/cafe/layout.tsx
// Makes /cafe installable on its own as a standalone "Cafe POS" home-screen app
// (separate manifest from the customer storefront, scoped to /cafe). Installing
// from the cafe page on an Android POS launches it full-screen with its own icon.
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Cafe POS — Cookie Doh",
  manifest: "/cafe.webmanifest",
  appleWebApp: { capable: true, title: "Cafe POS", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0014a7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // kiosk: stop accidental pinch-zoom on the register
};

export default function CafeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
