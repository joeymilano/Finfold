import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase";
import { PasswordRecoveryPanel } from "@/components/app-shell/PasswordRecoveryPanel";

/**
 * /reset-password — the landing target of the Supabase recovery email.
 *
 * /auth/callback exchanges the recovery code for a session cookie first,
 * so a valid session here proves the user owns the email. No session
 * (direct visit, expired or already-used link) → back to the request form.
 */
export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    redirect("/login");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/forgot-password?error=expired");
  }

  return <PasswordRecoveryPanel mode="reset" />;
}
