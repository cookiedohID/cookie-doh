// web/app/checkout/success/page.tsx

import { Suspense } from "react";
import SuccessClient from "./successClient";

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <main style={{ minHeight: "100vh", background: "#fff" }}>
          <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 16px" }}>
            <h1 style={{ margin: 0, fontSize: 22, color: "#101010" }}>Processing…</h1>
            <p style={{ margin: "8px 0 0", color: "#6B6B6B" }}>
              Finalising your order status.
            </p>
          </div>
        </main>
      }
    >
      <SuccessClient />
    </Suspense>
  );
}
