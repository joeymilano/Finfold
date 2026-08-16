import type { KitOutput } from "@/lib/content-schema";
import type { Locale } from "@/lib/i18n";
import type { CoverConfig, CoverSizeId } from "@/lib/cover/cover-spec";
import { coverSizes, getCoverTypeScale } from "@/lib/cover/cover-spec";
import { getEditorialTheme, getSwissAccent } from "@/lib/cover/cover-themes";
import { buildCoverContent } from "@/components/workbench/cover/cover-content";
import { EditorialHero } from "@/components/workbench/cover/editorial/EditorialHero";
import { PhotoImpact } from "@/components/workbench/cover/photo/PhotoImpact";
import { SwissStatement } from "@/components/workbench/cover/swiss/SwissStatement";
import type { CoverContent } from "@/components/workbench/cover/cover-content";

type CoverCanvasProps = {
  output: Pick<KitOutput, "title" | "cta" | "imageUrl">;
  platformLabel: string;
  sizeId: CoverSizeId;
  config: CoverConfig;
  locale: Locale;
  contentOverrides?: Partial<CoverContent>;
};

export function CoverCanvas({ output, platformLabel, sizeId, config, locale, contentOverrides }: CoverCanvasProps) {
  const size = coverSizes[sizeId];
  const type = getCoverTypeScale(sizeId);
  const content = {
    ...buildCoverContent(output, platformLabel, locale, sizeId, config.shortTitle),
    ...contentOverrides
  };

  if (config.style === "photo" && output.imageUrl) {
    return (
      <PhotoImpact
        imageUrl={output.imageUrl}
        theme={getEditorialTheme(config.themeId)}
        size={size}
        sizeId={sizeId}
        type={type}
        content={content}
      />
    );
  }

  if (config.style === "editorial" || config.style === "photo") {
    return <EditorialHero theme={getEditorialTheme(config.themeId)} size={size} type={type} content={content} />;
  }

  return <SwissStatement accent={getSwissAccent(config.themeId)} size={size} type={type} content={content} />;
}
