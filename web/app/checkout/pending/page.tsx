import { Suspense } from "react";
import PendingClient from "./pendingClient";

export default function PendingPage() {
  return (
    <Suspense fallback={null}>
      <PendingClient />
    </Suspense>
  );
}
