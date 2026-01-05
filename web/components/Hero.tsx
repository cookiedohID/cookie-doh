<p className="font-dearjoe" style={{ marginTop: 10, fontSize: 18 }}>
  (We tested it.)
</p>

export default function Hero() {
  return (
    <section style={{ padding: "80px 24px", textAlign: "center" }}>
      <h1 style={{ fontSize: 40, marginBottom: 16 }}>
        Life’s better with warm cookies.
      </h1>
      <p style={{ fontSize: 18, maxWidth: 520, margin: "0 auto 32px" }}>
        Thoughtfully baked. Ridiculously good.
        Pick your favorites — we’ll take care of the rest.
      </p>

      <a
        href="#build"
        style={{
          display: "inline-block",
          padding: "14px 28px",
          background: "#0047BB",
          color: "#fff",
          borderRadius: 8,
          textDecoration: "none",
          fontWeight: 500,
        }}
      >
        Build your box
      </a>
    </section>
  );
}
