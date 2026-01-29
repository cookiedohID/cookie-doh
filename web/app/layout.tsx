// web/app/layout.tsx
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cookie Doh",
  description: "Cookie Doh",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* ✅ Pure JS probe (runs even if React hydration is dead) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function () {
  try {
    // Create probe box
    var box = document.createElement('div');
    box.id = 'cd_js_probe';
    box.style.position = 'fixed';
    box.style.right = '10px';
    box.style.bottom = '10px';
    box.style.zIndex = '999999';
    box.style.background = 'rgba(0,0,0,0.85)';
    box.style.color = '#fff';
    box.style.padding = '10px 12px';
    box.style.borderRadius = '12px';
    box.style.fontSize = '12px';
    box.style.fontWeight = '800';
    box.style.maxWidth = '360px';
    box.style.pointerEvents = 'auto';
    box.style.whiteSpace = 'pre-wrap';
    box.textContent = 'JS probe booting...';
    document.addEventListener('DOMContentLoaded', function () {
      document.body.appendChild(box);
    });

    var hb = 0;
    var clicks = 0;
    var lastErr = '—';

    function render() {
      if (!box || !box.parentNode) return;
      box.textContent =
        'JS running: YES\\n' +
        'heartbeat: ' + hb + '\\n' +
        'clicks: ' + clicks + '\\n' +
        'last error: ' + lastErr;
    }

    // heartbeat proves JS executing
    setInterval(function () {
      hb++;
      render();
    }, 1000);

    // click capture proves events reaching document
    document.addEventListener('click', function () {
      clicks++;
      render();
    }, true);

    // capture runtime errors (this is usually the real cause)
    window.addEventListener('error', function (e) {
      lastErr = (e && e.message) ? e.message : String(e);
      render();
    });

    window.addEventListener('unhandledrejection', function (e) {
      try {
        lastErr = (e && e.reason) ? (e.reason.message || String(e.reason)) : 'unhandled rejection';
      } catch (x) {
        lastErr = 'unhandled rejection';
      }
      render();
    });

    // initial render
    document.addEventListener('DOMContentLoaded', render);
  } catch (e) {
    // if even this fails, JS is severely blocked
  }
})();`,
          }}
        />

        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
