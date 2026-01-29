// web/app/layout.tsx
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import ClickProbe from "@/components/ClickProbe";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cookie Doh",
  description: "Cookie Doh",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        <ClickProbe />
        {children}
      </body>
    </html>
  );
}
