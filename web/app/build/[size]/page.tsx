// web/app/build/[size]/page.tsx
import BuildClient from "../BuildClient";

type BoxSize = 1 | 3 | 6;

function parseSize(raw: unknown): BoxSize | null {
  const s = typeof raw === "string" ? raw : "";
  const n = Number(s);
  if (n === 1 || n === 3 || n === 6) return n;
  return null;
}

export default function BuildSizePage({ params }: { params: { size: string } }) {
  const initialBoxSize = parseSize(params.size) ?? 6;
  return <BuildClient initialBoxSize={initialBoxSize} />;
}
