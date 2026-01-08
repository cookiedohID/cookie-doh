import { Suspense } from "react";
import FailedClient from "./failedClient";

export default function CheckoutFailedPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>Loading…</div>}>
      <FailedClient />
    </Suspense>
  );
}
