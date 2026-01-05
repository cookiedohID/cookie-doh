import Link from "next/link";

export default function SiteHeader() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "#fff",
        borderBottom: "1px solid #eee",
      }}
    >
      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <Link href="/" style={{ textDecoration: "none", color: "inherit", fontWeight: 900 }}>
          Cookie Doh
        </Link>

        <div style={{ marginLeft: "auto", display: "flex", gap: 14 }}>
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
