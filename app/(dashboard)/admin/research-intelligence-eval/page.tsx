import { ResearchIntelligenceEvalClient } from "@/components/admin/ResearchIntelligenceEvalClient";
import { isAdmin } from "@/lib/auth-admin";
import { createSupabaseServerClient } from "@/lib/supabase";

export default async function ResearchIntelligenceEvalPage() {
  let authorized = false;
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) authorized = isAdmin(user.id);
  }
  return <ResearchIntelligenceEvalClient initialAuthorized={authorized} />;
}
