import OrdersClient from "./ordersClient";

export const runtime = "nodejs";

export default async function AdminOrdersPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin · Orders</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Manage recent orders and retry shipment creation (Biteship).
          </p>
        </div>

        <div className="rounded-2xl border bg-white px-4 py-2 text-xs text-neutral-600 shadow-sm">
          Protected
        </div>
      </div>

      <div className="mt-6">
        <OrdersClient />
      </div>
    </div>
  );
}
