import { Suspense } from "react";
import FailedClient from "./failedClient";

export default function FailedPage() {
  return (
    <Suspense fallback={null}>
      <FailedClient />
    </Suspense>
  );
}
