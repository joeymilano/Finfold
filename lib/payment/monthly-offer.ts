import offer from "./monthly-offer.json";

export const MONTHLY_OFFER = offer;

export function monthlyOfferPrice(price: number): number {
  return Math.round(Math.round(price * 100) * (100 - offer.percentage) / 100) / 100;
}

export function formatMonthlyUsd(price: number): string {
  return `$${price.toFixed(2)}`;
}

type Discount = {
  code?: string;
  status?: string;
  type?: string;
  percentage?: number;
  duration?: string;
  applies_to_products?: string[];
  expiry_date?: string | null;
  max_redemptions?: number | null;
  redeem_count?: number;
};

/** Reject a missing, expired, first-month-only, or incorrectly scoped offer. */
export function isMonthlyOfferValid(discount: Discount, productId: string): boolean {
  return discount.code === offer.code && discount.status === "active" &&
    discount.type === "percentage" && discount.percentage === offer.percentage &&
    discount.duration === "forever" &&
    Boolean(discount.applies_to_products?.includes(productId)) &&
    (!discount.expiry_date || new Date(discount.expiry_date).getTime() > Date.now()) &&
    (discount.max_redemptions == null || (discount.redeem_count ?? 0) < discount.max_redemptions);
}
