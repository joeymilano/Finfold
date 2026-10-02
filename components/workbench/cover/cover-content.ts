import type { KitOutput } from "@/lib/content-schema";
import type { Locale } from "@/lib/i18n";
import { deriveShortTitle } from "@/lib/cover/short-title";
import type { CoverSizeId } from "@/lib/cover/cover-spec";
import { displayContentTitle } from "@/lib/content-title";

export type CoverContent = {
  title: string;
  kicker: string;
  meta: string;
  highlight: string;
};

/** Pull the fields a poster template needs out of a raw KitOutput. */
export function buildCoverContent(
  output: Pick<KitOutput, "title" | "cta">,
  platformLabel: string,
  locale: Locale,
  sizeId: CoverSizeId,
  shortTitleOverride?: string
): CoverContent {
  const useShortTitle = sizeId === "wechat-1x1";
  const displayTitle = displayContentTitle(output.title, locale);
  const title = useShortTitle
    ? shortTitleOverride?.trim() || deriveShortTitle(displayTitle, locale)
    : displayTitle;

  const date = new Date().toISOString().slice(0, 10);

  return {
    title,
    kicker: platformLabel,
    meta: locale === "zh" ? `FINFOLD · ${date}` : `FINFOLD · ${date}`,
    highlight: output.cta
  };
}
