import { getCurrentUserId } from "@/lib/supabase";

// Admin allow-list for operator-only surfaces (the 经营码 reconcile page).
// Backed by the server-only ADMIN_USER_IDS env var — a comma-separated list of
// auth.users ids. profiles has no role/admin column, so an explicit id list is
// the simplest reliable gate; Joey's own user id goes in there.

function adminUserIds(): string[] {
  const raw = process.env.ADMIN_USER_IDS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdmin(userId: string): boolean {
  return adminUserIds().includes(userId);
}

/** Returns the admin's user id, or throws. Error.message "Unauthorized" means
 *  no session; Error.name "Forbidden" means logged-in but not an admin. Route
 *  handlers branch on these to return 401 vs 403. */
export async function requireAdmin(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!isAdmin(userId)) {
    const err = new Error("Forbidden");
    err.name = "Forbidden";
    throw err;
  }
  return userId;
}
