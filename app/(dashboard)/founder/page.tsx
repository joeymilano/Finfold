import { notFound, redirect } from "next/navigation";
import { FounderEvidenceDashboard } from "@/components/app-shell/FounderEvidenceDashboard";
import { getFounderAccess } from "@/lib/founder-access";

export const dynamic = "force-dynamic";

export default async function FounderPage() {
  const access = await getFounderAccess();
  if (!access.authenticated) redirect("/login?next=/founder");
  if (!access.authorized) notFound();
  return <FounderEvidenceDashboard />;
}
