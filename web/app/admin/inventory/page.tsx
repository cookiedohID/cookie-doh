// web/app/admin/inventory/page.tsx — the inventory page lives at /admin/flavors;
// redirect /admin/inventory there so the friendlier URL also works.
import { redirect } from "next/navigation";

export default function InventoryRedirect() {
  redirect("/admin/flavors");
}
