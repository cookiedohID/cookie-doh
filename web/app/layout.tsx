// web/app/layout.tsx
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cookie Doh",
  description: "Cookie Doh",
};

const isProd = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script
          id="midtrans-snap"
          src={
            isProd
              ? "https://app.midtrans.com/snap/snap.js"
              : "https://app.sandbox.midtrans.com/snap/snap.js"
          }
          data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY}
          strategy="afterInteractive"
        />
      </head>
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
