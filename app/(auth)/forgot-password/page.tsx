import { PasswordRecoveryPanel } from "@/components/app-shell/PasswordRecoveryPanel";

type ForgotPasswordPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams;
  return (
    <PasswordRecoveryPanel
      mode="request"
      initialError={params.error === "expired" ? "expired" : undefined}
    />
  );
}
