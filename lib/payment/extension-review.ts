/** Server-only, explicitly provisioned review allowance. Never a subscription. */
export const EXTENSION_REVIEW_CREDITS = 60;
export const EXTENSION_REVIEW_PERIOD = "extension-store-review-v1";

export function isExtensionReviewUser(userId: string): boolean {
  const configured = process.env.FINFOLD_EXTENSION_REVIEW_USER_ID;
  return Boolean(configured && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(configured) && userId === configured);
}

export function extensionReviewExpiry(userId: string, now = Date.now()): string | null {
  if (!isExtensionReviewUser(userId)) return null;
  const expiry = process.env.FINFOLD_EXTENSION_REVIEW_EXPIRES_AT;
  if (!expiry || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(expiry)) return null;
  const timestamp = Date.parse(expiry);
  return Number.isFinite(timestamp) && timestamp > now ? expiry : null;
}
