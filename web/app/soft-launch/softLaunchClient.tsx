"use client";

import { useMemo, useState } from "react";

export default function SoftLaunchClient({ nextPath }: { nextPath: string }) {
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);

  const next = useMemo(() => {
    // basic safety: only allow internal paths
    if (!nextPath || !nextPath.startsWith("/")) return "/";
    return nextPath;
  }, [nextPath]);

  function enter() {
    const p = pass.trim();
    if (!p) return;
    // proxy.ts will validate pass and set cookie, then redirect to next
    window.location.href = `/soft-launch?next=${encodeURIComponent(next)}&pass=${encodeURIComponent(p)}`;
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
            />
            <button
              onClick={() => setShow((v) => !v)}
              className="rounded-2xl border bg-white px-4 py-3 text-sm font-semibold hover:bg-neutral-100"
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>

          <button
            onClick={enter}
            className="mt-3 w-full rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            Enter
          </button>

          <p className="mt-3 text-xs text-neutral-500">
            If you don’t have access, please contact us via WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
}
