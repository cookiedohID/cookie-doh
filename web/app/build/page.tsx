// web/app/build/page.tsx

export const dynamic = "force-dynamic";

import BuildClient from "./BuildClient";

type BoxSize = 3 | 6;

function parseSize(raw: unknown): BoxSize | null {
  const s = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  const n = Number(s);
  if (n === 3 || n === 6) return n;
  return null;
}

export default async function BuildPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise and must be awaited before use.
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const initialBoxSize = parseSize(params.size) ?? 6;
  return <BuildClient initialBoxSize={initialBoxSize} />;
}
