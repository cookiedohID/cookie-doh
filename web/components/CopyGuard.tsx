"use client";
// web/components/CopyGuard.tsx — site-wide copy deterrent (owner request
// 2026-10-31, "like Kurly.com"): no right-click menu, no image drag, no
// copy/cut of page content. The CSS half (user-select: none) lives in
// globals.css under "Copy guard".
//
// A DETERRENT, not protection: screenshots, view-source and dev tools still
// get everything. It must never cost a customer or staff member a keystroke:
// inputs, textareas, selects and contenteditable stay fully usable (type,
// select, copy, paste, right-click), and anything marked `.allow-copy` or
// `[data-allow-copy]` (order numbers, SKUs, phones, addresses staff paste
// into courier apps) stays copyable. Screen readers and printing are not
// affected — nothing here hides text or touches print styles.
import { useEffect } from "react";

const ALLOWED =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .allow-copy, [data-allow-copy]';

function allowed(t: EventTarget | null): boolean {
  const el = t instanceof Element ? t : t instanceof Node ? t.parentElement : null;
  return !!el?.closest(ALLOWED);
}

// A copy is allowed when it comes from an editable/allow-copy element — the
// focused field, or where the current selection starts.
function copyAllowed(e: Event): boolean {
  if (allowed(e.target) || allowed(document.activeElement)) return true;
  const sel = typeof window !== "undefined" ? window.getSelection() : null;
  return !!sel && !sel.isCollapsed && allowed(sel.anchorNode) && allowed(sel.focusNode);
}

export default function CopyGuard() {
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      if (!copyAllowed(e)) e.preventDefault();
    };
    const onContextMenu = (e: MouseEvent) => {
      if (!allowed(e.target)) e.preventDefault();
    };
    const onDragStart = (e: DragEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest("img, picture, video, svg") || !allowed(e.target)) e.preventDefault();
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("dragstart", onDragStart);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("dragstart", onDragStart);
    };
  }, []);
  return null;
}
