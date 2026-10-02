import { createSupabaseServerClient } from "@/lib/supabase";

export type FounderAccess = {
  authenticated: boolean;
  authorized: boolean;
  userId?: string;
};

export async function getFounderAccess(): Promise<FounderAccess> {
  const client = await createSupabaseServerClient();
  if (!client) return { authenticated: false, authorized: false };

  const { data: { user } } = await client.auth.getUser();
  if (!user) return { authenticated: false, authorized: false };

  const allowedEmails = (process.env.FOUNDER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLocaleLowerCase())
    .filter(Boolean);
  const email = user.email?.trim().toLocaleLowerCase();

  return {
    authenticated: true,
    authorized: Boolean(email && allowedEmails.includes(email)),
    userId: user.id
  };
}
