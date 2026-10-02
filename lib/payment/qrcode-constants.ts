/**
 * Client-safe QR-code payment constants.
 *
 * Keep this module free of Supabase, next/headers, and other server-only
 * imports because both the customer pay page and the admin reconcile UI
 * render these labels in Client Components.
 */
export const QRCODE_PLANS = {
  starter_v2: { priceCNY: 79, name: "Starter", nameCN: "入门版" },
  creator_v2: { priceCNY: 199, name: "Creator", nameCN: "创作者" },
  growth_v2: { priceCNY: 999, name: "Growth Engine", nameCN: "增长引擎" },
  digital_employee_v2: { priceCNY: 2999, name: "Digital Employee", nameCN: "数字员工" }
} as const;

export type QrcodePlanId = keyof typeof QRCODE_PLANS;

/** Single source of truth for which plans are purchasable via scan payment —
 * the route whitelist, the order mapper, and the UI price table all derive
 * from QRCODE_PLANS through this guard. */
export function isQrcodePlanId(value: string | undefined): value is QrcodePlanId {
  return typeof value === "string" && value in QRCODE_PLANS;
}
