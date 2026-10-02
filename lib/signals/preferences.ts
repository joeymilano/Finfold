import type { createSupabaseAdminClient } from "@/lib/supabase";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const USER_METADATA_KEY = "signal_discovery_preferences";

export type SignalDiscoveryPreferences = { enabled: boolean; updatedAt?: string };

/** Discovery is on unless the user explicitly turned it off; unreadable storage fails open. */
export async function loadSignalDiscoveryPreferences(admin: AdminClient, userId: string): Promise<SignalDiscoveryPreferences> {
  try {
    const authAdmin = authAdminClient(admin);
    if (!authAdmin?.getUserById) return { enabled: true };
    const { data, error } = await authAdmin.getUserById(userId);
    if (error) throw error;
    return parseStored(data?.user?.user_metadata?.[USER_METADATA_KEY]);
  } catch (error) {
    console.warn("[signal-discovery] preferences unavailable; defaulting to enabled", error);
    return { enabled: true };
  }
}

export async function saveSignalDiscoveryPreferences(admin: AdminClient, userId: string, enabled: boolean): Promise<SignalDiscoveryPreferences> {
  const authAdmin = authAdminClient(admin);
  if (!authAdmin?.getUserById || !authAdmin?.updateUserById) {
    throw new Error("Signal discovery preference storage is unavailable.");
  }
  const { data: current, error: readError } = await authAdmin.getUserById(userId);
  if (readError) throw readError;
  const metadata = current?.user?.user_metadata && typeof current.user.user_metadata === "object"
    ? current.user.user_metadata
    : {};
  const value = { enabled, updatedAt: new Date().toISOString() };
  const { error: updateError } = await authAdmin.updateUserById(userId, {
    user_metadata: { ...metadata, [USER_METADATA_KEY]: value }
  });
  if (updateError) throw updateError;
  return value;
}

function parseStored(value: unknown): SignalDiscoveryPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { enabled: true };
  const record = value as { enabled?: unknown; updatedAt?: unknown };
  return { enabled: record.enabled === false ? false : true, updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined };
}

function authAdminClient(admin: AdminClient): {
  getUserById?: (userId: string) => Promise<{ data: { user: { user_metadata?: Record<string, unknown> } | null }; error: unknown }>;
  updateUserById?: (userId: string, attributes: { user_metadata: Record<string, unknown> }) => Promise<{ error: unknown }>;
} | undefined {
  return (admin as unknown as {
    auth?: { admin?: {
      getUserById?: (userId: string) => Promise<{ data: { user: { user_metadata?: Record<string, unknown> } | null }; error: unknown }>;
      updateUserById?: (userId: string, attributes: { user_metadata: Record<string, unknown> }) => Promise<{ error: unknown }>;
    } };
  }).auth?.admin;
}
