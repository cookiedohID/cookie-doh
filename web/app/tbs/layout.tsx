// web/app/tbs/layout.tsx — TotalBuahStore brand takeover for every /tbs page.
// The look is the owner's approved totalbuahstore.com design (ChatGPT preview,
// 2026-10-27): its stylesheet is vendored as ./tbs-design.css, scoped under
// .tbsx so nothing leaks into the Cookie Doh pages. The site-wide SiteHeader
// steps aside on /tbs (components/SiteHeader.tsx) and this layout draws the
// TBS header, store picker, basket drawer and footer instead.
import type { Metadata } from "next";
import "./tbs-design.css";
import { TbsChrome } from "./design/Chrome";

export const metadata: Metadata = {
  title: "totalbuahstore.com — Katalog produk",
  description: "Buah segar, sayuran dan kebutuhan sehari-hari dari TotalBuahStore. Pilih toko, lihat stok, pesan untuk diambil atau diantar.",
};

export default function TbsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="tbsx" data-text-sample="forest-green">
      <TbsChrome>{children}</TbsChrome>
    </div>
  );
}
