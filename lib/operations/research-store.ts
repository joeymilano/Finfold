import {
  mapResearchMission,
  RESEARCH_MISSION_FIELDS,
  type ResearchMission
} from "@/lib/operations/research";
import { createSupabaseAdminClient } from "@/lib/supabase";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

/** Every Research lookup used outside the list view goes through the same
 * user_id predicate. The admin client bypasses RLS, so this tenant condition
 * is a security boundary rather than a convenience filter. */
export async function loadOwnedResearchMission(
  admin: AdminClient,
  userId: string,
  missionId: string
): Promise<ResearchMission | null> {
  const { data, error } = await admin
    .from("research_missions")
    .select(RESEARCH_MISSION_FIELDS)
    .eq("id", missionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapResearchMission(data as never) : null;
}
