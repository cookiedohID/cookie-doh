const items = [
  { name: "The One", note: "Our crowd favorite" },
  { name: "The Other One", note: "Always a close second" },
  { name: "Matcha Magic", note: "Softly bold, quietly addictive" },
];

export default function BestSellers() {
  return (
    <section style={{ padding: "64px 24px", background: "#fff" }}>
      <h2 style={{ textAlign: "center", marginBottom: 32 }}>
        Crowd favorites (for a reason)
      </h2>

      <div
        style={{
          display: "grid",
          gap: 24,
          maxWidth: 900,
          margin: "0 auto",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        {items.map((item) => (
          <div
            key={item.name}
            style={{
              border: "1px solid #eee",
              padding: 24,
              borderRadius: 12,
            }}
          >
            <strong>{item.name}</strong>
            <p style={{ marginTop: 8, color: "#555" }}>{item.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
