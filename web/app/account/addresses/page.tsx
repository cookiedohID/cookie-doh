"use client";

// web/app/account/addresses/page.tsx — manage saved delivery addresses (multiple).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { COLORS } from "@/lib/theme";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import GoogleAddressInput from "@/components/GoogleAddressInput";

type Address = {
  id: string;
  label: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  address: string;
  building_name: string | null;
  postal: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  destination_area_id: string | null;
  destination_area_label: string | null;
  is_default: boolean;
};

const field: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.18)", fontSize: 15, background: "#fff", boxSizing: "border-box",
};

export default function AddressesPage() {
  const router = useRouter();
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<Address[]>([]);
  const [notReady, setNotReady] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  // new-address form state
  const [label, setLabel] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [address, setAddress] = useState("");
  const [building, setBuilding] = useState("");
  const [postal, setPostal] = useState("");
  const [city, setCity] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [resolved, setResolved] = useState(false);
  const [makeDefault, setMakeDefault] = useState(false);

  async function token() {
    const { data } = await getSupabaseBrowser().auth.getSession();
    return data.session?.access_token || null;
  }

  async function load() {
    setErr("");
    const t = await token();
    if (!t) { router.replace("/account/login"); return; }
    const res = await fetch("/api/account/addresses", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
    if (res.status === 401) { router.replace("/account/login"); return; }
    const j = await res.json().catch(() => ({}));
    if (j?.ok) { setList(Array.isArray(j.addresses) ? j.addresses : []); setNotReady(Boolean(j.notReady)); }
    else setErr(j?.error || "Couldn't load your addresses.");
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  function resetForm() {
    setLabel(""); setRecipientName(""); setRecipientPhone(""); setAddress("");
    setBuilding(""); setPostal(""); setCity(""); setLat(null); setLng(null);
    setResolved(false); setMakeDefault(false);
  }

  async function saveNew() {
    setErr("");
    if (!address.trim() || !resolved) { setErr("Please pick your address from the suggestions."); return; }
    setBusy(true);
    try {
      const t = await token();
      const res = await fetch("/api/account/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({
          label, recipient_name: recipientName, recipient_phone: recipientPhone,
          address, building_name: building, postal, city, lat, lng, is_default: makeDefault,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!j?.ok) { setErr(j?.error || "Couldn't save. Did you run the database migration?"); return; }
      resetForm(); setAdding(false); await load();
    } finally { setBusy(false); }
  }

  async function setDefault(a: Address) {
    setBusy(true);
    try {
      const t = await token();
      await fetch(`/api/account/addresses/${a.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ ...a, is_default: true }),
      });
      await load();
    } finally { setBusy(false); }
  }

  async function remove(a: Address) {
    setBusy(true);
    try {
      const t = await token();
      await fetch(`/api/account/addresses/${a.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } });
      await load();
    } finally { setBusy(false); }
  }

  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "32px 16px 80px" }}>
        <Link href="/account" style={{ color: COLORS.muted, textDecoration: "none", fontSize: 13, fontWeight: 700 }}>‹ Back to account</Link>
        <h1 style={{ margin: "8px 0 0", fontSize: 26, fontWeight: 800, color: COLORS.black }}>Saved Addresses</h1>
        <p style={{ margin: "4px 0 0", color: COLORS.muted, fontSize: 13 }}>Save your addresses for faster checkout.</p>

        {err ? <p style={{ marginTop: 14, color: "#C0392B", fontSize: 14 }}>{err}</p> : null}
        {notReady ? <p style={{ marginTop: 14, color: "#9A6700", fontSize: 13 }}>Saved addresses aren&apos;t enabled yet on the server.</p> : null}

        {loading ? (
          <p style={{ marginTop: 24, color: COLORS.muted }}>Loading…</p>
        ) : (
          <>
            <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
              {list.map((a) => (
                <div key={a.id} style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontWeight: 800, color: COLORS.black }}>{a.label || "Address"}</span>
                    {a.is_default ? <span style={{ fontSize: 11, fontWeight: 800, color: COLORS.blue, background: "#EAF2FF", padding: "3px 9px", borderRadius: 999 }}>Default</span> : null}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "#333", lineHeight: 1.5 }}>
                    {a.building_name ? <div>{a.building_name}</div> : null}
                    <div>{a.address}</div>
                    {a.postal ? <div style={{ color: COLORS.muted }}>{a.postal}</div> : null}
                    {(a.recipient_name || a.recipient_phone) ? <div style={{ color: COLORS.muted, marginTop: 4 }}>{a.recipient_name} {a.recipient_phone}</div> : null}
                  </div>
                  <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    {!a.is_default ? <button disabled={busy} onClick={() => setDefault(a)} style={{ border: "1px solid rgba(0,0,0,0.15)", background: "#fff", color: COLORS.blue, fontWeight: 700, fontSize: 13, padding: "7px 12px", borderRadius: 999, cursor: "pointer" }}>Set default</button> : null}
                    <button disabled={busy} onClick={() => remove(a)} style={{ border: "1px solid rgba(0,0,0,0.15)", background: "#fff", color: "#C0392B", fontWeight: 700, fontSize: 13, padding: "7px 12px", borderRadius: 999, cursor: "pointer" }}>Delete</button>
                  </div>
                </div>
              ))}
              {list.length === 0 && !notReady ? <p style={{ color: COLORS.muted, fontSize: 14 }}>No saved addresses yet.</p> : null}
            </div>

            {adding ? (
              <div style={{ marginTop: 16, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 16, display: "grid", gap: 10 }}>
                <input style={field} placeholder="Label (e.g. Home, Office)" value={label} onChange={(e) => setLabel(e.target.value)} />
                <GoogleAddressInput
                  apiKey={mapsKey}
                  value={address}
                  onChange={(v) => { setAddress(v); }}
                  onResolved={(val: any) => {
                    setAddress(String(val?.formattedAddress || val?.formatted_address || ""));
                    setLat(val?.lat ?? null);
                    setLng(val?.lng ?? null);
                    setResolved(!!val?.isResolved || (val?.lat != null && val?.lng != null));
                    if (val?.building) setBuilding(String(val.building));
                    if (val?.postal) setPostal(String(val.postal));
                    if (val?.city) setCity(String(val.city));
                  }}
                  placeholder="Type building name or address…"
                  className="w-full"
                />
                <input style={field} placeholder="Building / unit / notes (optional)" value={building} onChange={(e) => setBuilding(e.target.value)} />
                <div style={{ display: "flex", gap: 10 }}>
                  <input style={field} placeholder="Postal code" value={postal} onChange={(e) => setPostal(e.target.value)} />
                  <input style={field} placeholder="Recipient name" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
                </div>
                <input style={field} placeholder="Recipient phone (optional)" inputMode="tel" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} />
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: COLORS.black }}>
                  <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} /> Set as default
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button disabled={busy} onClick={saveNew} style={{ flex: 1, border: "none", background: COLORS.blue, color: "#fff", fontWeight: 800, padding: "12px", borderRadius: 999, cursor: "pointer" }}>{busy ? "Saving…" : "Save address"}</button>
                  <button disabled={busy} onClick={() => { resetForm(); setAdding(false); }} style={{ border: "1px solid rgba(0,0,0,0.15)", background: "#fff", color: COLORS.muted, fontWeight: 700, padding: "12px 16px", borderRadius: 999, cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} style={{ marginTop: 16, width: "100%", border: `1.5px solid ${COLORS.blue}`, background: "#fff", color: COLORS.blue, fontWeight: 800, padding: "13px", borderRadius: 999, cursor: "pointer" }}>+ Add address</button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
