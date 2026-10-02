import { createSupabaseServerClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth-admin";
import { ReconcileClient } from "@/components/billing/ReconcileClient";


// Server entry — best-effort auth gate so a non-admin doesn't even see the
// shell flash before the API returns 403. The /api/admin/reconcile endpoint
// re-checks requireAdmin() on every call (defense in depth).
export default async function ReconcilePage() {
  let authorized = false;
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (user) authorized = isAdmin(user.id);
  }
  return <ReconcileClient initialAuthorized={authorized} />;
}
