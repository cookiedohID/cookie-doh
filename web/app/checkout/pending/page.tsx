import { Suspense } from "react";
import PendingClient from "./pendingClient";

export default function CheckoutPendingPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>Loading…</div>}>
      <PendingClient />
    </Suspense>
  );
}
