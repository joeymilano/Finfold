import type { MockupProps } from "@/components/workbench/mockups/types";
import { FacebookMockup } from "@/components/workbench/mockups/FacebookMockup";
import { InstagramMockup } from "@/components/workbench/mockups/InstagramMockup";
import { LinkedInMockup } from "@/components/workbench/mockups/LinkedInMockup";
import { MomentsMockup } from "@/components/workbench/mockups/MomentsMockup";
import { NewsletterMockup } from "@/components/workbench/mockups/NewsletterMockup";
import { ProductHuntMockup } from "@/components/workbench/mockups/ProductHuntMockup";
import { RedditMockup } from "@/components/workbench/mockups/RedditMockup";
import { ThreadsMockup } from "@/components/workbench/mockups/ThreadsMockup";
import { WechatMockup } from "@/components/workbench/mockups/WechatMockup";
import { XiaohongshuMockup } from "@/components/workbench/mockups/XiaohongshuMockup";
import { XMockup } from "@/components/workbench/mockups/XMockup";
import { ZhihuMockup } from "@/components/workbench/mockups/ZhihuMockup";

// Interactive premium phone social preview — one high-fidelity mockup per platform.
export function SocialMockup({ platform, title, body, cta, notes, imageUrl, locale }: MockupProps) {
  switch (platform) {
    case "xiaohongshu":
      return <XiaohongshuMockup title={title} body={body} cta={cta} notes={notes} imageUrl={imageUrl} locale={locale} />;
    case "zhihu":
      return <ZhihuMockup title={title} body={body} cta={cta} notes={notes} imageUrl={imageUrl} locale={locale} />;
    case "moments":
      return <MomentsMockup body={body} cta={cta} imageUrl={imageUrl} locale={locale} />;
    case "wechat":
      return <WechatMockup title={title} body={body} cta={cta} notes={notes} imageUrl={imageUrl} locale={locale} />;
    case "linkedin":
      return <LinkedInMockup body={body} cta={cta} notes={notes} imageUrl={imageUrl} locale={locale} />;
    case "reddit":
    case "hacker-news":
    case "indie-hackers":
      return <RedditMockup platform={platform} title={title} body={body} cta={cta} notes={notes} imageUrl={imageUrl} locale={locale} />;
    case "product-hunt":
      return <ProductHuntMockup title={title} body={body} cta={cta} notes={notes} imageUrl={imageUrl} locale={locale} />;
    case "medium-substack":
      return <NewsletterMockup title={title} body={body} cta={cta} imageUrl={imageUrl} locale={locale} />;
    case "threads":
      return <ThreadsMockup body={body} cta={cta} imageUrl={imageUrl} locale={locale} />;
    case "instagram":
      return <InstagramMockup body={body} cta={cta} notes={notes} imageUrl={imageUrl} locale={locale} />;
    case "facebook":
      return <FacebookMockup body={body} cta={cta} notes={notes} imageUrl={imageUrl} locale={locale} />;
    case "x":
    default:
      return <XMockup body={body} cta={cta} notes={notes} imageUrl={imageUrl} locale={locale} />;
  }
}
