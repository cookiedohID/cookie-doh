"use client";

// web/app/tbs/c/[cat]/page.tsx — legacy category URL (ERP class ids). The
// catalogue now lives on /tbs?category=<code> (owner's category tree); send
// old links there.
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function TbsCategoryRedirect() {
  const router = useRouter();
  const params = useParams<{ cat: string }>();
  useEffect(() => {
    const cat = decodeURIComponent(String(params?.cat || ""));
    router.replace(/^\d{3}$/.test(cat) ? `/tbs?category=${cat}` : "/tbs");
  }, [params, router]);
  return <main className="wrap"><p style={{ padding: 40, color: "var(--muted)" }}>Mengalihkan…</p></main>;
}
