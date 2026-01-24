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
  if (typeof searchParams?.then === "function") return (await searchParams) as SP;
  return searchParams as SP;
}

function formatIDR(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

// Clears cart on page load
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

// ⚠️ Put your ADMIN WhatsApp number here (no +)
const ADMIN_WA = "6281932181818";

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

  const total = Number(sp.total || "");
  const name = sp.name ? decodeURIComponent(sp.name) : "";
  const phone = sp.phone ? decodeURIComponent(sp.phone) : "";
  const address = sp.address ? decodeURIComponent(sp.address) : "";
  const building = sp.building ? decodeURIComponent(sp.building) : "";
  const postal = sp.postal ? decodeURIComponent(sp.postal) : "";
  const boxes = sp.boxes ? decodeURIComponent(sp.boxes) : "";

  // Customer WhatsApp message (proof of payment)
  const customerWA = `https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(
    `Hi Cookie Doh 👋\n\nI have completed payment for my order.\n\n` +
      `Order ID: ${orderId}\n` +
      `Total: Rp. ${Number.isFinite(total) ? total.toLocaleString("id-ID") : "-"}\n\n` +
      `Here is my proof of payment. Thank you 🤍`
  )}`;

  // Admin WhatsApp message (full order details)
  const adminWA = `https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(
    `Cookie Doh — Payment Pending (from checkout)\n\n` +
      `Order ID: ${orderId}\n` +
      `Total: Rp. ${Number.isFinite(total) ? total.toLocaleString("id-ID") : "-"}\n\n` +
      `Customer: ${name || "-"}\n` +
      `Phone: ${phone || "-"}\n\n` +
      `Address:\n${address || "-"}\n` +
      (building ? `\nBuilding: ${building}` : "") +
      (postal ? `\nPostal: ${postal}` : "") +
      (boxes ? `\n\nOrder details:\n${boxes}` : "") +
      `\n\nPlease confirm once payment proof is received. 🤍`
  )}`;

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
          <h2 style={{ margin: 0, fontSize: 18 }}>Payment Instructions</h2>

          <p style={{ marginTop: 8, marginBottom: 0, color: "#444", fontWeight: 700 }}>
            Please complete your payment by scanning the QR code below for the total amount of{" "}
            <strong>
              Rp. {Number.isFinite(total) ? total.toLocaleString("id-ID") : "—"}
            </strong>.
          </p>

          <p style={{ marginTop: 10, color: "#555", fontWeight: 700 }}>
            After payment has been made, kindly send your proof of payment to us via WhatsApp using
            the button below.
          </p>

          <p style={{ marginTop: 6, color: "#555", fontWeight: 700 }}>
            Once the proof of payment is received, we will proceed with processing your order.
          </p>
        </div>
      </section>

      {/* WHATSAPP BUTTONS */}
      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {/* Customer proof button */}
        <a
          href={customerWA}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 18px",
            borderRadius: 14,
            background: "#25D366",
            color: "#fff",
            fontWeight: 900,
            textDecoration: "none",
            fontSize: 15,
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M20.52 3.48A11.78 11.78 0 0012.03 0C5.4 0 .02 5.38.02 12a11.88 11.88 0 001.64 5.94L0 24l6.26-1.64A11.88 11.88 0 0012 24c6.62 0 12-5.38 12-12a11.78 11.78 0 00-3.48-8.52zM12 21.82a9.8 9.8 0 01-5-1.36l-.36-.21-3.72.98.99-3.63-.23-.38a9.8 9.8 0 01-1.36-5c0-5.42 4.4-9.82 9.82-9.82s9.82 4.4 9.82 9.82-4.4 9.82-9.82 9.82zm5.38-7.34c-.29-.15-1.72-.85-1.99-.95s-.46-.15-.65.15-.75.95-.92 1.15-.34.22-.63.07a7.9 7.9 0 01-2.33-1.43 8.7 8.7 0 01-1.61-2c-.17-.29 0-.45.13-.6.13-.13.29-.34.43-.51.15-.17.2-.29.29-.49s.05-.36-.02-.51-.65-1.56-.89-2.14c-.23-.55-.46-.48-.65-.49h-.55c-.19 0-.49.07-.75.36s-.98.96-.98 2.34.99 2.71 1.12 2.9c.13.19 1.95 2.97 4.73 4.16.66.28 1.17.45 1.57.58.66.21 1.26.18 1.74.11.53-.08 1.72-.7 1.97-1.38s.25-1.26.17-1.38c-.08-.13-.27-.21-.56-.36z" />
          </svg>
          Send Proof of Payment via WhatsApp
        </a>

        {/* Admin details button */}
        <a
          href={adminWA}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 18px",
            borderRadius: 14,
            background: "#0052CC",
            color: "#fff",
            fontWeight: 900,
            textDecoration: "none",
            fontSize: 15,
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M20.52 3.48A11.78 11.78 0 0012.03 0C5.4 0 .02 5.38.02 12a11.88 11.88 0 001.64 5.94L0 24l6.26-1.64A11.88 11.88 0 0012 24c6.62 0 12-5.38 12-12a11.78 11.78 0 00-3.48-8.52zM12 21.82a9.8 9.8 0 01-5-1.36l-.36-.21-3.72.98.99-3.63-.23-.38a9.8 9.8 0 01-1.36-5c0-5.42 4.4-9.82 9.82-9.82s9.82 4.4 9.82 9.82-4.4 9.82-9.82 9.82z" />
          </svg>
          WhatsApp Admin (send order details)
        </a>
      </div>

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
