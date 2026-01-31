//web/components/WhatsAppButton.tsx//
 
"use client";

export default function WhatsAppButton() {
  const phone = "6281932181818";
  const message = encodeURIComponent("Hi Cookie Doh 👋 I’d like to order cookies 🍪");

  return (
    <a
      href={`https://wa.me/${phone}?text=${message}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        width: 56,
        height: 56,
        borderRadius: 9999,
        background: "#25D366",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
        zIndex: 2147483647, // max
      }}
    >
      <svg viewBox="0 0 32 32" fill="white" width="28" height="28">
        <path d="M19.11 17.64c-.27-.14-1.6-.79-1.85-.88-.25-.09-.43-.14-.6.14-.18.27-.69.88-.85 1.06-.16.18-.31.2-.58.07-.27-.14-1.15-.42-2.19-1.34-.81-.72-1.36-1.61-1.52-1.88-.16-.27-.02-.42.12-.56.12-.12.27-.31.41-.46.14-.16.18-.27.27-.46.09-.18.05-.35-.02-.5-.07-.14-.6-1.44-.82-1.97-.22-.53-.44-.46-.6-.46h-.51c-.18 0-.46.07-.7.35-.25.27-.92.9-.92 2.2 0 1.3.94 2.56 1.07 2.74.14.18 1.85 2.83 4.48 3.97.63.27 1.12.43 1.5.55.63.2 1.21.17 1.67.1.51-.08 1.6-.65 1.83-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.32zM16.04 3C9.39 3 4 8.39 4 15.04c0 2.65.87 5.1 2.35 7.08L5 29l7.1-1.85a12.01 12.01 0 0 0 3.94.65c6.65 0 12.04-5.39 12.04-12.04C28.08 8.39 22.69 3 16.04 3z" />
      </svg>
    </a>
  );
}
