import type { Locale } from "@/lib/i18n";

export type MockupProps = {
  platform: string;
  title: string;
  body: string;
  cta: string;
  notes: string;
  locked: boolean;
  imageUrl?: string;
  locale: Locale;
};
