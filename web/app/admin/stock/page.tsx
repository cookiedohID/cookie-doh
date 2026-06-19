// web/app/admin/stock/page.tsx — "Stock" is the Inventory page; redirect there.
import { redirect } from "next/navigation";

export default function StockRedirect() {
  redirect("/admin/flavors");
}
