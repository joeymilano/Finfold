/**
 * Client-safe QR-code payment constants.
 *
 * Keep this module free of Supabase, next/headers, and other server-only
 * imports because both the customer pay page and the admin reconcile UI
 * render these labels in Client Components.
 */
export const QRCODE_PLANS = {
  starter_v2: { priceCNY: 79, name: "Starter", nameCN: "入门版" },
  creator_v2: { priceCNY: 199, name: "Creator", nameCN: "创作者" }
} as const;

export type QrcodePlanId = keyof typeof QRCODE_PLANS;
