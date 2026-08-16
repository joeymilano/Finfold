
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { ArrowRight } from "@/components/ui/icons";
import { getPublicSharedKit } from "@/lib/kit-shares";
import { getGoal, type GoalId } from "@/lib/goals";
import { getPlatform } from "@/lib/platforms";
import { brand } from "@/lib/brand";
import { detectLocaleFromHeaders, sharePageCopy } from "@/lib/i18n";
import { FishLogo } from "@/components/app-shell/FishLogo";
import { SharedKitBoard } from "@/components/share/SharedKitBoard";

type PageParams = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;
  const kit = await getPublicSharedKit(slug);

  if (!kit) {
    return {
      title: `${brand.name} — Shared Kit`,
      robots: { index: false, follow: false }
    };
  }

  const locale = detectLocaleFromHeaders(await headers());
  const title = `${kit.ideaText.slice(0, 60)}${kit.ideaText.length > 60 ? "…" : ""} — ${brand.name}`;
  const description = locale === "zh"
    ? `用 ${brand.name} 生成的平台原生内容包，覆盖 ${kit.outputs.length} 个平台。`
    : `A platform-native content kit generated with ${brand.name}, covering ${kit.outputs.length} platforms.`;

  const firstImage = kit.outputs.find((output) => output.imageUrl)?.imageUrl;
  const socialImage = firstImage
    ? { url: firstImage }
    : brand.socialImage;

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: "article",
      images: [socialImage]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage.url]
    }
  };
}

export default async function SharedKitPage({ params }: PageParams) {
  const { slug } = await params;
  const locale = detectLocaleFromHeaders(await headers());
  const copy = sharePageCopy[locale];
  const kit = await getPublicSharedKit(slug);

  if (!kit) {
    notFound();
  }

  const goal = getGoal(kit.goal as GoalId);
  const platformLabels = kit.outputs.map((output) => getPlatform(output.platform).label).join(" · ");

  return (
    <main className="min-h-screen bg-bg">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-5 py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg">
            <FishLogo variant="app-icon" className="h-9 w-9 object-cover" />
          </span>
          <span className="leading-none">
            <span className="block text-base font-semibold text-fg">{brand.name}</span>
            {locale === "zh" ? (
              <span className="brand-cn mt-0.5 block text-[10px] text-fg-muted">{brand.chineseName}</span>
            ) : null}
          </span>
        </Link>
        <Link href="/workbench" className="btn-primary focus-ring inline-flex items-center gap-1.5 px-3.5 py-2 text-sm">
          {copy.tryFree} <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      <div className="mx-auto max-w-4xl px-5 pb-16">
        <div className="panel p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{goal.labelEn}</p>
          <h1 className="mt-2 text-xl font-semibold leading-snug text-fg sm:text-2xl">{kit.ideaText}</h1>
          <p className="mt-3 text-xs text-fg-muted">
            {copy.nPlatforms(kit.outputs.length)} · {platformLabels}
          </p>
        </div>

        <div className="mt-6">
          <SharedKitBoard outputs={kit.outputs} />
        </div>

        <div className="panel-inset mt-8 p-6">
          <p className="text-center text-sm font-semibold text-fg">{copy.madeWith}</p>
          <p className="mx-auto mt-2 max-w-xl text-center text-xs leading-5 text-fg-muted">{copy.tryYourself}</p>
          <div className="mt-5 flex justify-center">
            <Link href="/workbench" className="btn-primary focus-ring inline-flex items-center gap-2 text-sm">
              {copy.tryFree} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
