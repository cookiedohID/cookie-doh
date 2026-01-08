import { Suspense } from "react";
import SuccessClient from "./successClient";

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>Loading…</div>}>
      <SuccessClient />
    </Suspense>
  );
}
