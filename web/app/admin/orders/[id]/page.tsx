//web/app/admin/orders/[id]/page.tsx

import OrderDetailClient from "./OrderDetailClient";

export default function AdminOrderDetailPage({ params }: { params: { id: string } }) {
  return <OrderDetailClient id={params.id} />;
}
