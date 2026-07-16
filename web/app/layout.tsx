// web/app/layout.tsx
import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import localFont from "next/font/local";
import SiteHeader from "@/components/SiteHeader";
import Script from "next/script";
import "./globals.css";
import WhatsAppButton from "@/components/WhatsAppButton";
import Footer from "@/components/Footer";
import RefCapture from "@/components/RefCapture";
import HolidayGate from "@/components/HolidayGate";
import HolidayBanner from "@/components/HolidayBanner";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

const dearjoe = localFont({
  src: "../public/fonts/dearjoe-5-casual.otf",
  variable: "--font-dearjoe",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cookie Doh — where the cookie magic happens",
  description:
    "Build your own box of freshly baked gourmet cookies. Mix and match signature flavours, packed with care and gift-ready.",
};

const isProd = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} ${dearjoe.variable}`}>
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
        <RefCapture />
        <HolidayBanner />
        <SiteHeader />
        <HolidayGate>{children}</HolidayGate>
        <Footer />
        <WhatsAppButton />
      </body>
    </html>
  );
}
