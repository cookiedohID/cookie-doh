import Link from "next/link";
import { BOX_PRICES, formatIDR } from "@/lib/catalog";

const sizes: Array<1 | 3 | 6> = [1, 3, 6];

export default function BuildIndexPage() {
  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Build your box ✨</h1>
      <p>Pick a box size — free choice, duplicates welcome.</p>

      <div
        style={{
          display: "grid",
          gap: 16,
          marginTop: 20,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        {sizes.map((s) => (
          <Link
            key={s}
            href={`/build/${s}`}
            prefetch={false}
            style={{
              display: "block",
              border: "1px solid #eee",
              borderRadius: 12,
              padding: 18,
              textDecoration: "none",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 18 }}>Box of {s}</div>
            <div style={{ marginTop: 6, color: "#444" }}>
              IDR {formatIDR(BOX_PRICES[s])}
            </div>
            <div style={{ marginTop: 10, color: "var(--brand-blue)", fontWeight: 700 }}>
              Choose this →
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
