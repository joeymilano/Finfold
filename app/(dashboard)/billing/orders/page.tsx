"use client";

import { useLocale } from "@/hooks/useLocale";
import { OrderHistory } from "@/components/billing/OrderHistory";

export default function BillingOrdersPage() {
  const locale = useLocale();
  return <OrderHistory locale={locale} />;
}
