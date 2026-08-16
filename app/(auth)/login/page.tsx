import { AuthSplit } from "@/components/app-shell/AuthSplit";
import { sanitizeInternalReturnTo } from "@/lib/auth-return";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  return <AuthSplit mode="login" returnTo={sanitizeInternalReturnTo(params.next)} />;
}
