import type { Metadata } from "next";
import "./globals.css";
import { Poppins } from "next/font/google";
import localFont from "next/font/local";
import SiteHeader from "@/components/SiteHeader";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const dearJoe = localFont({
  src: "../public/fonts/dearjoe-5-casual.otf",
  variable: "--font-dearjoe",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cookie Doh",
  description: "Where the cookie magic happens.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${poppins.variable} ${dearJoe.variable}`}>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
