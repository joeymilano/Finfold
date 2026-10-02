import type { KitOutput } from "@/lib/content-schema";
import type { Locale } from "@/lib/i18n";
import type { PlatformId } from "@/lib/platforms";
import type { VisualStory } from "@/lib/visual-story";
import { visualStoryFormats, type VisualStoryFormatId } from "@/lib/visual-story-formats";
import { formatBodyWithVisualAssets } from "@/lib/kit-export";
import { buildContentSkillPlan } from "@/lib/content-skills";
import { buildMotionStoryboard } from "@/lib/motion-storyboard";
import { displayContentTitle } from "@/lib/content-title";

export type PublicationPackage = ReturnType<typeof buildPublicationPackage>;

export function buildPublicationPackage(input: {
  output: KitOutput;
  platform: PlatformId;
  locale: Locale;
  story: VisualStory;
  formatId: VisualStoryFormatId;
  generatedAt?: string;
}) {
  const format = visualStoryFormats[input.formatId];
  const assets = (input.output.visualAssets ?? [])
    .filter((asset) => asset.isCurrent !== false)
    .sort((a, b) => a.positionIndex - b.positionIndex)
    .map((asset, index) => ({
      order: index + 1,
      placementIndex: asset.positionIndex,
      role: asset.role,
      sourceExcerpt: asset.sourceExcerpt,
      altText: asset.altText,
      imageUrl: asset.imageUrl,
      filename: `article-illustration-${String(index + 1).padStart(2, "0")}.png`
    }));
  const skillPlan = buildContentSkillPlan(input.output, input.locale);
  const motionStoryboard = buildMotionStoryboard(input.story, input.formatId);

  return {
    schemaVersion: 2,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    platform: input.platform,
    locale: input.locale,
    publication: {
      title: displayContentTitle(input.output.title, input.locale),
      body: formatBodyWithVisualAssets(input.output),
      cta: input.output.cta
    },
    contentSkill: skillPlan,
    articleIllustrations: assets,
    visualStory: {
      formatId: input.formatId,
      width: format.width,
      height: format.height,
      ratio: format.ratio,
      theme: input.story.theme,
      artDirection: input.story.artDirection,
      pageCount: input.story.pages.length,
      pages: input.story.pages.map((page, index) => ({
        order: index + 1,
        filename: `visual-story-${String(index + 1).padStart(2, "0")}.png`,
        ...page
      }))
    },
    motionStoryboard
  };
}
