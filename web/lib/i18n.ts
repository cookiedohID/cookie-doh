"use client";

// web/lib/i18n.ts — tiny EN/ID dictionary for the storefront UI chrome.
// Owner decision (via infra, 2026-07-06): interface texts only — product
// names/data stay single-source Indonesian. Default language = ID; the
// visitor's choice persists in localStorage (cd_lang). A few KB, no duplicate
// rendering — this is a word lookup, not a second site.
import { useEffect, useState } from "react";

export type Lang = "id" | "en";

const D: Record<string, { id: string; en: string }> = {
  // ---- header / nav ----
  "nav.categories": { id: "Kategori", en: "Categories" },
  "nav.family": { id: "Family", en: "Family" },
  "header.changeStore": { id: "Ganti toko", en: "Change store" },
  // ---- shop chrome ----
  "shop.searchPlaceholder": { id: "Cari buah, camilan, kebutuhan harian…", en: "Search fruit, snacks, groceries…" },
  "shop.bestSellers": { id: "⭐ Terlaris", en: "⭐ Best sellers" },
  "shop.shopByCategory": { id: "Belanja per kategori", en: "Shop by category" },
  "shop.featured": { id: "Produk pilihan", en: "Featured products" },
  "shop.results": { id: "Hasil untuk", en: "Results for" },
  "shop.nothingFound": { id: "Tidak ditemukan", en: "Nothing found" },
  "shop.unreachable": { id: "Toko sedang tidak terjangkau — mungkin sedang bangun.", en: "The store is unreachable right now — it may be waking up." },
  "shop.tryAgain": { id: "Coba lagi", en: "Try again" },
  "shop.loadMore": { id: "Muat lagi", en: "Load more" },
  "shop.loading": { id: "Memuat…", en: "Loading…" },
  "shop.perUnit": { id: "per", en: "per" },
  "shop.chooseStore": { id: "Pilih toko TotalBuahStore-mu", en: "Choose your TotalBuahStore" },
  "shop.storeNote": { id: "Harga, stok, dan ambil/antar mengikuti toko ini.", en: "Prices, stock and pickup/delivery come from this store." },
  "shop.switchStoreConfirm": { id: "Ganti toko akan mengosongkan keranjang (harga & stok tiap toko berbeda). Lanjut?", en: "Switching store clears your basket (prices & stock differ per store). Continue?" },
  // ---- basket ----
  "basket.title": { id: "Keranjangmu", en: "Your basket" },
  "basket.pickupOrDelivery": { id: "Ambil di toko atau diantar dari toko ini.", en: "Pickup or delivery from this store." },
  "basket.empty": { id: "Keranjangmu kosong — yuk isi yang segar!", en: "Your basket is empty — add something fresh!" },
  "basket.browse": { id: "Lihat-lihat toko", en: "Browse the shop" },
  "basket.total": { id: "Total", en: "Total" },
  "basket.items": { id: "item", en: "items" },
  "basket.checkout": { id: "Checkout", en: "Checkout" },
  "basket.checkoutTogether": { id: "Checkout bersama", en: "Checkout together" },
  "basket.onePayment": { id: "Satu pembayaran — kue & belanjaan dikirim bersama", en: "One payment — cookies & groceries ship together" },
  "basket.fixFlagged": { id: "⚠️ Perbaiki item bertanda (hapus atau kurangi) untuk lanjut checkout.", en: "⚠️ Fix the flagged items (remove or reduce) to continue to checkout." },
  "basket.onlyNLeft": { id: "Sisa {n} — kurangi jumlahnya", en: "Only {n} left — reduce the quantity" },
  "basket.onlyNGroup": { id: "Total stok {n} untuk semua ukuran kemasan — kurangi", en: "Only {n} in stock across all pack sizes — reduce" },
  "basket.outOfStock": { id: "Stok habis — mohon hapus", en: "Out of stock — please remove" },
  "basket.someUnavailable": { id: "⚠️ Beberapa item tidak tersedia sejumlah itu — hapus atau kurangi untuk checkout.", en: "⚠️ Some items are no longer available in this quantity — please remove or reduce them to check out." },
  "basket.addMore": { id: "+ tambah lagi", en: "+ add more" },
  "basket.shipsTogether": { id: "dari {store} — dikirim bersama kukismu", en: "from {store} — ships together with your cookies" },
  "basket.subtotal": { id: "Subtotal TotalBuahStore", en: "TotalBuahStore subtotal" },
  // ---- product page ----
  "p.chooseOption": { id: "Pilih varian", en: "Choose an option" },
  "p.soldOut": { id: "(Habis)", en: "(Sold out)" },
  "p.totalAmount": { id: "Jumlah harga", en: "Total amount" },
  "p.addToBasket": { id: "Masukkan keranjang", en: "Add to basket" },
  "p.added": { id: "Masuk keranjang ✓", en: "Added ✓" },
  "p.buyNow": { id: "Beli sekarang", en: "Buy now" },
  "p.findOtherStores": { id: "🔎 Cek toko lain", en: "🔎 Find in other stores" },
  "p.description": { id: "Deskripsi", en: "Description" },
  "p.details": { id: "Detail", en: "Details" },
  "p.notInCatalog": { id: "Produk ini tidak ada di katalog online.", en: "This product isn't in the online catalog." },
  "p.backToShop": { id: "← Kembali ke toko", en: "← Back to the shop" },
  // ---- checkout ----
  "co.checkout": { id: "Checkout", en: "Checkout" },
  "co.yourName": { id: "Nama kamu", en: "Your name" },
  "co.whatsapp": { id: "Nomor WhatsApp (08…)", en: "WhatsApp number (08…)" },
  "co.pickup": { id: "🏬 Ambil di toko", en: "🏬 Pickup at store" },
  "co.delivery": { id: "🛵 Antar ke saya", en: "🛵 Deliver to me" },
  "co.pickupNote": { id: "Ambil di {store} — kami WhatsApp saat siap.", en: "Collect at {store} — we'll WhatsApp you when it's ready." },
  "co.deliveryNote": { id: "Ongkir dihitung dari jarak ke {store} (maks 12 km) — tampil sebelum bayar.", en: "Delivery fee is by distance from {store} (max 12 km) — shown before you pay." },
  "co.addressPlaceholder": { id: "Alamat pengantaran (pilih dari saran)", en: "Delivery address (pick from suggestions)" },
  "co.notes": { id: "Catatan untuk toko (opsional)", en: "Notes for the store (optional)" },
  "co.items": { id: "Barang", en: "Items" },
  "co.deliveryFee": { id: "Ongkir", en: "Delivery" },
  "co.total": { id: "Total", en: "Total" },
  "co.pay": { id: "Bayar", en: "Pay" },
  "co.openingPayment": { id: "Membuka pembayaran…", en: "Opening payment…" },
  "co.pricesConfirmed": { id: "Harga dikonfirmasi toko saat pembayaran. QRIS / kartu via Midtrans.", en: "Prices are confirmed by the store at payment time. QRIS / cards via Midtrans." },
  "co.promise": { id: "🛡 Janji siap: dalam 3 jam operasional (10:00–21:00) — atau kami kirim voucher Rp10.000.", en: "🛡 Arrival promise: ready within 3 store hours (10:00–21:00) — or we send you a Rp10.000 voucher." },
  "co.emptyBasket": { id: "Keranjangmu kosong.", en: "Your basket is empty." },
  "co.fixFirst": { id: "⚠️ Beberapa item tidak tersedia — kembali dan hapus atau kurangi dulu untuk bayar.", en: "⚠️ Some items are no longer available — go back and remove or reduce them to pay." },
  "co.subtotal": { id: "Subtotal", en: "Subtotal" },
  // ---- success ----
  "ok.received": { id: "Pesanan diterima! 🎉", en: "Order received! 🎉" },
  "ok.preparing": { id: "Toko sedang menyiapkan pesananmu. Kami akan WhatsApp kamu saat dikonfirmasi — dan saat siap diambil atau diantar.", en: "The store is getting your order ready. We'll WhatsApp you when it's confirmed — and when it's ready for pickup or on its way." },
  "ok.viewOrders": { id: "Lihat pesananku", en: "View my orders" },
  "ok.keepShopping": { id: "Belanja lagi", en: "Keep shopping" },
  // ---- orders / status ----
  "ord.myOrders": { id: "Pesanan Saya", en: "My Orders" },
  "ord.subtitle": { id: "Pembelian cafe & online kamu.", en: "Your cafe & online purchases." },
  "ord.all": { id: "Semua", en: "All" },
  "ord.toPay": { id: "Belum Bayar", en: "To pay" },
  "ord.preparing": { id: "Disiapkan", en: "Being prepared" },
  "ord.ready": { id: "Siap", en: "Ready" },
  "ord.done": { id: "Selesai", en: "Completed" },
  "ord.stage.topay": { id: "💳 Belum bayar", en: "💳 To pay" },
  "ord.stage.preparing": { id: "👩‍🍳 Sedang disiapkan", en: "👩‍🍳 Being prepared" },
  "ord.stage.ready": { id: "🛍 Siap / dalam perjalanan", en: "🛍 Ready / on the way" },
  "ord.stage.done": { id: "✅ Selesai", en: "✅ Completed" },
  "ord.stage.cancelled": { id: "✗ Dibatalkan", en: "✗ Cancelled" },
  "ord.continuePayment": { id: "💳 Lanjutkan pembayaran", en: "💳 Continue payment" },
  "ord.buyAgain": { id: "🍒 Beli lagi — susun ulang keranjang", en: "🍒 Buy again — rebuild this basket" },
  "ord.rate": { id: "⭐ Nilai pesanan ini", en: "⭐ Rate this order" },
  "ord.rateEarn": { id: "— dapat 100 poin 🍒", en: "— earn 100 🍒 points" },
  "ord.tellMore": { id: "Ceritakan lebih (opsional)", en: "Tell us more (optional)" },
  "ord.thanks": { id: "Terima kasih! 💛", en: "Thank you! 💛" },
  "ord.needHelp": { id: "💬 Butuh bantuan? Chat kami", en: "💬 Need help? Chat with us" },
  "ord.orderNo": { id: "No. pesanan", en: "Order no." },
  "ord.date": { id: "Tanggal", en: "Date" },
  "ord.payment": { id: "Pembayaran", en: "Payment" },
  "ord.copy": { id: "Salin", en: "Copy" },
  "ord.copied": { id: "Tersalin ✓", en: "Copied ✓" },
  "ord.track": { id: "Lacak 🛰", en: "Track 🛰" },
  "ord.shippingInfo": { id: "🚚 Info pengiriman", en: "🚚 Shipping info" },
  "ord.timeline.paid": { id: "Dibayar", en: "Paid" },
  "ord.timeline.preparing": { id: "Disiapkan", en: "Being prepared" },
  "ord.timeline.ready": { id: "Siap", en: "Ready" },
  "ord.timeline.done": { id: "Selesai", en: "Completed" },
  // ---- gate ----
  "gate.openingSoon": { id: "Buah & belanjaan segar — segera buka. Punya kata sandi akses awal?", en: "Fresh fruit & groceries — opening soon. Have an early-access password?" },
  "gate.password": { id: "Kata sandi", en: "Password" },
  "gate.enter": { id: "Masuk", en: "Enter" },
  "gate.wrong": { id: "Kata sandi salah — tanyakan ke yang mengundangmu.", en: "That password isn't right — check with the person who invited you." },
};

export function tFor(lang: Lang) {
  return (key: string, vars?: Record<string, string | number>): string => {
    let s = D[key]?.[lang] ?? D[key]?.id ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };
}

export function getLang(): Lang {
  try { return (localStorage.getItem("cd_lang") as Lang) === "en" ? "en" : "id"; } catch { return "id"; }
}

export function setLang(l: Lang) {
  try { localStorage.setItem("cd_lang", l); window.dispatchEvent(new Event("cd-lang")); } catch { /* ignore */ }
}

export function useLang() {
  const [lang, set] = useState<Lang>("id");
  useEffect(() => {
    set(getLang());
    const on = () => set(getLang());
    window.addEventListener("cd-lang", on);
    return () => window.removeEventListener("cd-lang", on);
  }, []);
  return { lang, setLang, t: tFor(lang) };
}
