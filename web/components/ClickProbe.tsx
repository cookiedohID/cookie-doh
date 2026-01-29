// web/components/ClickProbe.tsx
"use client";

import { useEffect, useState } from "react";

export default function ClickProbe() {
  const [heartbeat, setHeartbeat] = useState(0);
  const [lastDocClick, setLastDocClick] = useState("—");

  useEffect(() => {
    const t = setInterval(() => setHeartbeat((x) => x + 1), 1000);

    const onClick = (ev: MouseEvent) => {
      const el = ev.target as HTMLElement | null;
      const tag = el?.tagName || "UNKNOWN";
      const id = el?.id ? `#${el.id}` : "";
      const cls = el?.className
        ? `.${String(el.className).split(" ").filter(Boolean)[0] || ""}`
        : "";
      setLastDocClick(`${tag}${id}${cls} @ ${Math.round(ev.clientX)},${Math.round(ev.clientY)}`);
    };

    document.addEventListener("click", onClick, true); // capture
    return () => {
      clearInterval(t);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        right: 10,
        bottom: 10,
        zIndex: 999999,
        background: "rgba(0,0,0,0.85)",
        color: "#fff",
        padding: "10px 12px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 800,
        maxWidth: 320,
        pointerEvents: "auto",
      }}
    >
      <div>Hydration heartbeat: {heartbeat}</div>
      <div style={{ marginTop: 6, opacity: 0.85 }}>lastDocClick: {lastDocClick}</div>
    </div>
  );
}
