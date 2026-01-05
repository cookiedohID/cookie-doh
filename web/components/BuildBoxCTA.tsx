export default function BuildBoxCTA() {
  return (
    <section
      id="build"
      style={{
        padding: "72px 24px",
        background: "#0047BB",
        color: "#fff",
        textAlign: "center",
      }}
    >
      <h2 style={{ marginBottom: 12 }}>Your box, your rules</h2>
      <p style={{ marginBottom: 28 }}>
        Mix, match, repeat. Duplicate favorites encouraged.
      </p>

      <a
        href="/build/6"
        style={{
          display: "inline-block",
          padding: "14px 28px",
          background: "#fff",
          color: "#0047BB",
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
