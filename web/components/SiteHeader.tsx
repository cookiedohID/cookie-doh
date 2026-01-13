import Link from "next/link";
import Image from "next/image";

export default function SiteHeader() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "#0047bb",
        borderBottom: "1px solid #eee",
      }}
    >
      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <Link
          href="/"
          style={{
            textDecoration: "none",
            color: "inherit",
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
          }}
        >
          <Image
            src="/logo.png"
            alt="Cookie Doh"
            width={140}
            height={28}
            priority
            style={{ height: "auto", width: "140px", maxWidth: "100%" }}
          />
        </Link>

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 14,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Link href="/build/6" style={{ textDecoration: "none", color: "inherit" }}>
            Build a box
          </Link>
          <Link href="/cart" style={{ textDecoration: "none", color: "inherit" }}>
            Cart
          </Link>
        </div>
      </div>
    </header>
  );
}
