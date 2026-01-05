export default function Footer() {
  return (
    <footer
      style={{
        background: "#000",
        color: "#fff",
        padding: "32px 24px",
        textAlign: "center",
        fontSize: 14,
      }}
    >
      © {new Date().getFullYear()} Cookie Doh. Made with love.
    </footer>
  );
}
