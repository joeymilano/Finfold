import type { Metadata } from "next";
import { MissionControl } from "@/components/app-shell/MissionControl";

export const metadata: Metadata = {
  title: "Growth Missions | Finfold",
  description: "Review active Growth Missions, approve consequential actions, and track business outcomes."
};

export default async function MissionsPage({ searchParams }: { searchParams: Promise<{ missionId?: string }> }) {
  const { missionId } = await searchParams;
  return <div className="mx-auto max-w-[1240px] xl:max-w-[1440px] 2xl:max-w-[1640px]"><MissionControl initialMissionId={missionId} /></div>;
}
