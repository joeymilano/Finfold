
import { cookies } from "next/headers";
import { AuthSplit } from "@/components/app-shell/AuthSplit";
import { REFERRAL_COOKIE } from "@/lib/referrals";
import { sanitizeInternalReturnTo } from "@/lib/auth-return";

type SignupPageProps = {
  searchParams: Promise<{ referral?: string; next?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const [params, cookieStore] = await Promise.all([searchParams, cookies()]);
  const hasReferralCookie = Boolean(cookieStore.get(REFERRAL_COOKIE)?.value);
  const referralOffer =
    hasReferralCookie ? "valid" : params.referral === "invalid" ? "invalid" : null;
  return (
    <AuthSplit
      mode="signup"
      referralOffer={referralOffer}
      returnTo={sanitizeInternalReturnTo(params.next)}
    />
  );
}
