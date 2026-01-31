import OrderDetailClient from "./OrderDetailClient";

type ParamsObj = { id?: string };
type MaybePromise<T> = T | Promise<T>;

export default async function AdminOrderDetailPage({
  params,
}: {
  params: MaybePromise<ParamsObj>;
}) {
  const resolved = typeof (params as any)?.then === "function" ? await (params as any) : (params as any);
  const id = String(resolved?.id ?? "").trim();

  return <OrderDetailClient id={id} />;
}
