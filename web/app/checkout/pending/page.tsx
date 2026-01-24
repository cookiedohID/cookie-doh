import Image from "next/image";

type SP = {
  order_id?: string;
  total?: string;
  name?: string;
  phone?: string;
  address?: string;
  building?: string;
  postal?: string;
  boxes?: string;
};

// Works whether Next provides searchParams as an object or a Promise
async function getSearchParams(searchParams: any): Promise<SP> {
  if (!searchParams) return {};
  // If it's a Promise
  if (typeof searchParams?.then === "function") return (await searchParams) as SP;
  return searchParams as SP;
}

function formatIDR(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function ClearCartClient() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          try {
            localStorage.removeItem("cart");
            localStorage.removeItem("cookie_doh_cart");
            localStorage.removeItem("cart_items");
          } catch (e) {}
        `,
      }}
    />
  );
}

export default async function PendingPage(props: { searchParams?: any }) {
  const sp = await getSearchParams(props.searchParams);

  const orderId = String(sp.order_id || "").trim();

  if (!orderId) {
    return (
      <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 26 }}>Payment Pending</h1>
        <p style={{ marginTop: 10, fontWeight: 800, color: "crimson" }}>
          Missing order id.
        </p>
        <p style={{ marginTop: 8, color: "#555" }}>
          Tip: URL must contain <code>?order_id=...</code>
        </p>
      </main>
    );
  }

  // Optional: show summary from URL (since you're already passing it)
  const total = Number(sp.total || "");
  const name = sp.name ? decodeURIComponent(sp.name) : "";
  const phone = sp.phone ? decodeURIComponent(sp.phone) : "";
  const address = sp.address ? decodeURIComponent(sp.address) : "";
  const building = sp.building ? decodeURIComponent(sp.building) : "";
  const postal = sp.postal ? decodeURIComponent(sp.postal) : "";
  const boxes = sp.boxes ? decodeURIComponent(sp.boxes) : "";

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <ClearCartClient />

      <h1 style={{ margin: 0, fontSize: 26 }}>Payment Pending</h1>
      <p style={{ marginTop: 8, color: "#555", fontWeight: 800 }}>
        Order ID: <span style={{ color: "#111" }}>{orderId}</span>
      </p>

      {/* QR PAYMENT BLOCK */}
      <section
        style={{
          marginTop: 18,
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 16,
          padding: 16,
          display: "grid",
          gridTemplateColumns: "240px 1fr",
          gap: 16,
          alignItems: "center",
          background: "#fff",
        }}
      >
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.10)",
            borderRadius: 16,
            padding: 10,
            background: "#fff",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Image
            src="/payments/qr.png"
            alt="Cookie Doh QR Payment"
            width={220}
            height={220}
            priority
          />
        </div>

        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Scan to Pay</h2>
          <p style={{ marginTop: 8, marginBottom: 0, color: "#444", fontWeight: 700 }}>
            Scan the QR code to complete your payment.
          </p>
          <ul style={{ marginTop: 10, color: "#555", fontWeight: 700, paddingLeft: 18 }}>
            <li>After payment, your order will be processed automatically.</li>
            <li>If you need help, WhatsApp us with your Order ID.</li>
          </ul>
        </div>
      </section>

      {/* ORDER SUMMARY (from URL) */}
      <section
        style={{
          marginTop: 18,
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 16,
          padding: 16,
          background: "#fff",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>Order Summary</h2>

        <div style={{ marginTop: 10, display: "grid", gap: 6, color: "#222", fontWeight: 800 }}>
          {name ? <div>Customer: {name}</div> : null}
          {phone ? <div>Phone: {phone}</div> : null}
          {building ? <div>Building: {building}</div> : null}
          {postal ? <div>Postal: {postal}</div> : null}
          {address ? <div>Address: {address}</div> : null}
        </div>

        {boxes ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Boxes</div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                background: "rgba(0,0,0,0.04)",
                padding: 12,
                borderRadius: 12,
                fontWeight: 800,
                color: "#111",
              }}
            >
              {boxes}
            </pre>
          </div>
        ) : null}

        <div style={{ marginTop: 14, borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900 }}>
            <div>Total</div>
            <div>{Number.isFinite(total) ? formatIDR(total) : "—"}</div>
          </div>
        </div>
      </section>
    </main>
  );
}
