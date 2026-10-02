import { MissionControl } from "@/components/app-shell/MissionControl";

export default async function MissionPage({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  return <div className="mx-auto max-w-[1240px] xl:max-w-[1440px] 2xl:max-w-[1640px]"><MissionControl initialMissionId={missionId} /></div>;
}
