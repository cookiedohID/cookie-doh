// web/app/admin/layout.tsx
// Makes /admin installable as its own standalone "CD Admin" home-screen app
// (separate manifest from the storefront + cafe, scoped to /admin). On a phone,
// "Add to Home Screen" from any admin page launches it full-screen with its own
// icon. Server component (no "use client") so it can export metadata/viewport;
// it just wraps the existing admin pages. The manifest lives at a non-"/admin"
// path so the admin auth gate (proxy.ts) doesn't block the browser fetching it.
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Admin — Cookie Doh",
  manifest: "/backoffice.webmanifest",
  appleWebApp: { capable: true, title: "CD Admin", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0014a7",
  width: "device-width",
  initialScale: 1,
  // Admin has tables + forms — keep pinch-zoom available (unlike the cafe kiosk).
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
