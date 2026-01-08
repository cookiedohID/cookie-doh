"use client";

import { useMemo, useState } from "react";

export default function SoftLaunchClient({ nextPath }: { nextPath: string }) {
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const next = useMemo(() => {
    if (!nextPath || !nextPath.startsWith("/")) return "/";
    return nextPath;
  }, [nextPath]);

  async function enter() {
    const p = pass.trim();
    if (!p) {
      setErr("Please enter password.");
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/soft-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pass: p, next }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Wrong password");

      const go = json?.next && typeof json.next === "string" ? json.next : next;
      window.location.href = go;
    } catch (e: any) {
      setErr(e?.message ?? "Wrong password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-xl items-center px-4 py-10">
      <div className="w-full rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cookie Doh · Soft Launch</h1>
            <p className="mt-2 text-sm text-neutral-600">
              We’re currently in private soft launch. Enter the access password to continue.
            </p>
          </div>
          <div className="rounded-2xl bg-black px-3 py-2 text-xs font-medium text-white">
            Private
          </div>
        </div>

        {err ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        ) : null}

        <div className="mt-6 space-y-2">
          <label className="text-xs text-neutral-500">Access password</label>

          <div className="flex gap-2">
            <input
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              type={show ? "text" : "password"}
              placeholder="Enter password"
              className="w-full rounded-2xl border bg-white px-4 py-3 text-sm outline-none focus:ring-2"
              onKeyDown={(e) => {
                if (e.key === "Enter") enter();
              }}
              // Autofill suppression (not 100%, but helps a lot)
              autoComplete="new-password"
              name="cd_softlaunch_password"
              data-lpignore="true"
              data-form-type="other"
            />

            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="rounded-2xl border bg-white px-4 py-3 text-sm font-semibold hover:bg-neutral-100"
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>

          <button
            type="button"
            onClick={enter}
            disabled={loading}
            className="mt-3 w-full rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Entering…" : "Enter"}
          </button>

          <p className="mt-3 text-xs text-neutral-500">
            If you don’t have access, please contact us via WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
}
