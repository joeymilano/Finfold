import { redirect } from "next/navigation";

export default async function LegacyGrowthGoalRedirect({ params }: { params: Promise<{ goalId: string }> }) {
  const { goalId } = await params;
  redirect(`/operations/growth/${goalId}`);
}
