import { redirect } from "next/navigation";
import { OAuthConsentClient } from "@/components/auth/OAuthConsentClient";
import { buildAuthHref, isValidOAuthAuthorizationId } from "@/lib/auth-return";
import { createSupabaseServerClient } from "@/lib/supabase";

type ConsentPageProps = {
  searchParams: Promise<{ authorization_id?: string }>;
};

export default async function OAuthConsentPage({ searchParams }: ConsentPageProps) {
  const { authorization_id: authorizationId } = await searchParams;
  if (!isValidOAuthAuthorizationId(authorizationId)) {
    return <OAuthConsentClient authorizationId="invalid" />;
  }

  const supabase = await createSupabaseServerClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!data.user) {
    const returnTo = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(buildAuthHref("/login", returnTo));
  }

  return <OAuthConsentClient authorizationId={authorizationId} />;
}
