import SoftLaunchClient from "./softLaunchClient";

export const runtime = "nodejs";

export default function SoftLaunchPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  return <SoftLaunchClient nextPath={searchParams?.next || "/"} />;
}
