import OrdersClient from "./ordersClient";

export const runtime = "nodejs";

export default function AdminOrdersPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-6 sm:px-4 sm:py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Admin · Orders
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            Monitor orders, mark paid/fulfilled, and create shipments.
          </p>

          <div className="mt-2 text-xs text-neutral-500">
            Tip: On mobile, orders show as cards (no sideways scrolling).
          </div>
        </div>

        <div className="inline-flex w-fit items-center justify-center rounded-2xl border bg-white px-3 py-2 text-xs text-neutral-600 shadow-sm">
          Protected
        </div>
      </div>

      <div className="mt-5 sm:mt-6">
        <OrdersClient />
      </div>
    </div>
  );
}
