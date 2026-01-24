import Image from "next/image";

type PendingPageProps = {
  searchParams: { order_id?: string };
};

async function getOrder(orderId: string) {
  // You must have this API route. I include it in section #3.
  const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/orders/${orderId}`, {
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error || "Failed to load order");
  return j.order;
}

function formatIDR(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

// Client-side cart clear (runs when page loads)
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

export default async function PendingPage({ searchParams }: PendingPageProps) {
  const orderId = (searchParams?.order_id || "").trim();

  if (!orderId) {
    return (
      <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 26 }}>Payment Pending</h1>
        <p style={{ marginTop: 10 }}>Missing order id.</p>
      </main>
    );
  }

  let order: any = null;
  let loadError: string | null = null;

  try {
    order = await getOrder(orderId);
  } catch (e: any) {
    loadError = e?.message || "Failed to load order";
  }

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <ClearCartClient />

      <h1 style={{ margin: 0, fontSize: 26 }}>Payment Pending</h1>
      <p style={{ marginTop: 8, color: "#555", fontWeight: 700 }}>
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

      {/* ORDER SUMMARY */}
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

        {loadError ? (
          <p style={{ marginTop: 10, color: "crimson", fontWeight: 900 }}>{loadError}</p>
        ) : !order ? (
          <p style={{ marginTop: 10 }}>Loading…</p>
        ) : (
          <>
            <div style={{ marginTop: 10, display: "grid", gap: 6, color: "#222", fontWeight: 800 }}>
              <div>Customer: {order.customer_name || "—"}</div>
              <div>Phone: {order.customer_phone || "—"}</div>
              <div>Address: {order.shipping_address || "—"}</div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Items</div>
              <div style={{ display: "grid", gap: 8 }}>
                {(order.items || []).map((it: any, i: number) => (
                  <div
                    key={i}
                    style={{
                      border: "1px solid rgba(0,0,0,0.08)",
                      borderRadius: 12,
                      padding: 10,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      background: "rgba(0,0,0,0.02)",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>
                      {it.name}{" "}
                      <span style={{ color: "#666", fontWeight: 800 }}>
                        × {it.quantity || 1}
                      </span>
                    </div>
                    <div style={{ fontWeight: 900 }}>
                      {typeof it.price_idr === "number" ? formatIDR(it.price_idr) : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 14, borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900 }}>
                <div>Total</div>
                <div>
                  {typeof order.total_idr === "number" ? formatIDR(order.total_idr) : "—"}
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
